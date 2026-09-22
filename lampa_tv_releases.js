git add .(function () {
    'use strict';

    if (window.lampa_release_tracker) return;
    window.lampa_release_tracker = true;

    var request = new Lampa.Reguest();
    var API = 'https://api.themoviedb.org/3';
    var DAYS = 180;
    var PAGE_SIZE = 3;

    function language() {
        var l = Lampa.Storage.get('language', 'ru');
        return l === 'uk' ? 'uk-UA' : l === 'en' ? 'en-US' : 'ru-RU';
    }

    function api(path, params, success, error) {
        params = params || {};
        params.api_key = Lampa.TMDB.key();
        params.language = params.language || language();

        var query = Object.keys(params).map(function (key) {
            return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
        }).join('&');

        request.silent(API + path + '?' + query, success, error || function () {});
    }

    function iso(d) {
        return d.toISOString().slice(0, 10);
    }

    function dateText(value) {
        if (!value) return '';
        var p = value.split('-');
        return p.length === 3 ? p[2] + '.' + p[1] + '.' + p[0] : value;
    }

    function dates() {
        var today = new Date();
        var from = new Date(today);
        from.setDate(from.getDate() - DAYS);

        return {
            today: iso(today),
            from: iso(from)
        };
    }

    function discover(path, params, done) {
        api(path, params, function (data) {
            done(data.results || []);
        }, function () {
            done([]);
        });
    }

    /*
     * NEW SEASONS
     * Берём сериалы, у которых уже вышел сезон №2+.
     * Затем проверяем фактическую дату начала каждого сезона.
     */
    function newSeasons(done) {
        var d = dates();

        discover('/discover/tv', {
            sort_by: 'first_air_date.desc',
            'first_air_date.lte': d.today,
            'air_date.gte': d.from,
            'air_date.lte': d.today,
            include_adult: false,
            page: 1
        }, function (items) {
            var result = [];
            var left = items.length;

            if (!left) return done([]);

            items.forEach(function (item) {
                api('/tv/' + item.id, {}, function (show) {
                    var seasons = (show.seasons || []).filter(function (s) {
                        return s.season_number > 1 && s.air_date &&
                            s.air_date >= d.from && s.air_date <= d.today;
                    });

                    if (seasons.length) {
                        seasons.sort(function (a, b) {
                            return new Date(b.air_date) - new Date(a.air_date);
                        });

                        item._release_type = 'season';
                        item._season = seasons[0].season_number;
                        item._release_date = seasons[0].air_date;
                        item._release_label = 'Сезон ' + item._season;
                        item.number_of_seasons = show.number_of_seasons;
                        item.number_of_episodes = show.number_of_episodes;
                        result.push(item);
                    }

                    left--;
                    if (!left) {
                        result.sort(function (a, b) {
                            return new Date(b._release_date) - new Date(a._release_date);
                        });
                        done(result);
                    }
                }, function () {
                    left--;
                    if (!left) done(result);
                });
            });
        });
    }

    /*
     * NEW SERIES
     * Только новые сериалы, чей первый эпизод вышел за последние 180 дней.
     */
    function newSeries(done) {
        var d = dates();

        discover('/discover/tv', {
            sort_by: 'first_air_date.desc',
            'first_air_date.gte': d.from,
            'first_air_date.lte': d.today,
            include_adult: false,
            page: 1
        }, function (items) {
            items.forEach(function (item) {
                item._release_type = 'series';
                item._release_date = item.first_air_date;
                item._release_label = 'Новый сериал';
            });

            items.sort(function (a, b) {
                return new Date(b._release_date) - new Date(a._release_date);
            });

            done(items);
        });
    }

    function openCard(item) {
        Lampa.Activity.push({
            url: '',
            component: 'full',
            id: item.id,
            method: 'tv',
            card: item,
            source: 'tmdb'
        });
    }

    function buildCard(item, scroll, parent) {
        var card = Lampa.Template.get('card', item);
        var view = card.find('.card__view');

        view.css('position', 'relative');

        var label = $('<div class="release-tracker-label">' +
            item._release_label +
            '</div>');

        var date = $('<div class="release-tracker-date">' +
            dateText(item._release_date) +
            '</div>');

        view.append(label);
        view.append(date);

        card.on('hover:focus', function () {
            scroll.update(card, true);
        });

        card.on('hover:enter', function () {
            openCard(item);
        });

        parent.append(card);
    }

    function TrackerComponent() {
        var html = $('<div class="release-tracker"></div>');
        var scroll = new Lampa.Scroll({
            mask: true,
            over: true,
            step: 250,
            end_ratio: 2
        });

        var content = $('<div class="release-tracker-grid"></div>');
        var current = 0;
        var lists = [[], []];
        var titles = ['Новые сезоны', 'Новые сериалы'];
        var loading = true;

        function renderTab() {
            content.empty();

            var items = lists[current];

            if (!items.length) {
                content.append('<div class="release-tracker-empty">Ничего не найдено</div>');
            } else {
                items.forEach(function (item) {
                    buildCard(item, scroll, content);
                });
            }

            Lampa.Layer.update();
            loading = false;
        }

        this.create = function () {
            html.append(
                '<div class="release-tracker-tabs">' +
                    '<div class="release-tracker-tab selector" data-tab="0">Новые сезоны</div>' +
                    '<div class="release-tracker-tab selector" data-tab="1">Новые сериалы</div>' +
                '</div>'
            );

            html.append(scroll.render());
            scroll.append(content);

            var self = this;

            html.find('.release-tracker-tab').on('hover:enter', function () {
                current = Number($(this).attr('data-tab'));
                html.find('.release-tracker-tab').removeClass('active');
                $(this).addClass('active');
                renderTab();
                Lampa.Controller.toggle('content');
            });

            html.find('.release-tracker-tab').eq(0).addClass('active');

            self.activity.loader(true);

            newSeasons(function (seasons) {
                lists[0] = seasons;
                self.activity.loader(false);
                renderTab();

                newSeries(function (series) {
                    lists[1] = series;
                });
            });

            return html;
        };

        this.start = function () {
            Lampa.Controller.add('content', {
                toggle: function () {
                    Lampa.Controller.collectionSet(scroll.render());
                },
                left: function () {
                    if (Navigator.canmove('left')) Navigator.move('left');
                    else Lampa.Controller.toggle('menu');
                },
                right: function () {
                    Navigator.move('right');
                },
                up: function () {
                    if (Navigator.canmove('up')) Navigator.move('up');
                    else Lampa.Controller.toggle('head');
                },
                down: function () {
                    Navigator.move('down');
                },
                back: function () {
                    Lampa.Activity.backward();
                }
            });

            Lampa.Controller.toggle('content');
        };

        this.render = function () {
            return html;
        };

        this.pause = function () {};
        this.stop = function () {};

        this.destroy = function () {
            scroll.destroy();
            html.remove();
        };
    }

    Lampa.Lang.add({
        release_tracker: {
            ru: 'Новинки сериалов',
            uk: 'Новинки серіалів',
            en: 'TV Releases'
        }
    });

    Lampa.Component.add('release_tracker_component', TrackerComponent);

    function addMenu() {
        if ($('.release-tracker-menu').length) return;

        var button = $(
            '<li class="menu__item selector release-tracker-menu">' +
                '<div class="menu__ico">' +
                    '<svg viewBox="0 0 24 24" width="70" height="70">' +
                        '<path fill="currentColor" d="M19 3h-1V1h-2v2H8V1H6v2H5a3 3 0 0 0-3 3v13a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3V6a3 3 0 0 0-3-3zm1 16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-7h16v7zm0-9H4V6a1 1 0 0 1 1-1h1v2h2V5h8v2h2V5h1a1 1 0 0 1 1 1v4z"/>' +
                    '</svg>' +
                '</div>' +
                '<div class="menu__text">Новинки сериалов</div>' +
            '</li>'
        );

        button.on('hover:enter', function () {
            Lampa.Activity.push({
                url: '',
                title: 'Новинки сериалов',
                component: 'release_tracker_component',
                page: 1
            });
        });

        $('.menu .menu__list').eq(0).append(button);

        $('body').append(
            '<style>' +
            '.release-tracker-grid{display:flex;flex-wrap:wrap;}' +
            '.release-tracker-grid .card{position:relative;}' +
            '.release-tracker-label,.release-tracker-date{' +
                'position:absolute;z-index:20;background:rgba(0,0,0,.84);' +
                'color:#fff;padding:.28em .55em;border-radius:.25em;font-size:.82em;' +
            '}' +
            '.release-tracker-label{top:.5em;left:.5em;font-weight:bold;}' +
            '.release-tracker-date{top:.5em;right:.5em;}' +
            '.release-tracker-tabs{display:flex;gap:.5em;padding:1em 1em .6em;}' +
            '.release-tracker-tab{padding:.55em 1em;border-radius:.3em;background:rgba(255,255,255,.08);}' +
            '.release-tracker-tab.active{background:rgba(255,255,255,.2);}' +
            '.release-tracker-empty{width:100%;padding:4em;text-align:center;font-size:1.2em;}' +
            '</style>'
        );
    }

    if (window.appready) addMenu();
    else Lampa.Listener.follow('app', function (e) {
        if (e.type === 'ready') addMenu();
    });
})();
