(function () {
    'use strict';

    /*
     * LAMPA TV RELEASES
     * Новые сезоны + новые сериалы
     *
     * Версия: 2.0.0
     */

    if (window.lampa_tv_releases_v2) return;
    window.lampa_tv_releases_v2 = true;

    var PLUGIN_NAME = 'lampa_tv_releases';

    var API = 'https://api.themoviedb.org/3';
    var DAYS = 180;

    var request = null;

    /*
     * ---------------------------------------------------------
     * INIT
     * ---------------------------------------------------------
     */

    function startPlugin() {

        if (typeof Lampa === 'undefined') {
            setTimeout(startPlugin, 300);
            return;
        }

        if (!Lampa.Component ||
            !Lampa.Activity ||
            !Lampa.Reguest) {

            setTimeout(startPlugin, 300);
            return;
        }

        try {
            request = new Lampa.Reguest();

            registerComponent();
            addStyles();
            addMenu();

            console.log('[TV RELEASES] plugin started');

        } catch (e) {

            console.log(
                '[TV RELEASES] start error:',
                e && (e.stack || e.message || e)
            );

            if (Lampa.Noty && Lampa.Noty.show) {
                Lampa.Noty.show(
                    'Новинки сериалов: ошибка запуска'
                );
            }
        }
    }

    /*
     * ---------------------------------------------------------
     * LANGUAGE
     * ---------------------------------------------------------
     */

    function getLanguage() {

        var lang = 'ru';

        try {
            lang = Lampa.Storage.get(
                'language',
                'ru'
            );
        } catch (e) {}

        if (lang === 'uk') return 'uk-UA';
        if (lang === 'en') return 'en-US';

        return 'ru-RU';
    }

    /*
     * ---------------------------------------------------------
     * DATE
     * ---------------------------------------------------------
     */

    function dateISO(date) {

        var y = date.getFullYear();
        var m = String(
            date.getMonth() + 1
        ).padStart(2, '0');

        var d = String(
            date.getDate()
        ).padStart(2, '0');

        return y + '-' + m + '-' + d;
    }


    function getDates() {

        var today = new Date();

        var from = new Date(today);

        from.setDate(
            from.getDate() - DAYS
        );

        return {
            today: dateISO(today),
            from: dateISO(from)
        };
    }


    function formatDate(value) {

        if (!value) return '';

        var p = value.split('-');

        if (p.length !== 3) {
            return value;
        }

        return (
            p[2] +
            '.' +
            p[1] +
            '.' +
            p[0]
        );
    }

    /*
     * ---------------------------------------------------------
     * TMDB REQUEST
     * ---------------------------------------------------------
     */

    function api(path, params, success, error) {

        params = params || {};

        var key = '';

        try {
            key = Lampa.TMDB.key();
        } catch (e) {}

        if (!key) {

            console.log(
                '[TV RELEASES] TMDB key unavailable'
            );

            if (error) error();
            return;
        }

        params.api_key = key;
        params.language = params.language || getLanguage();

        var query = Object.keys(params)
            .map(function (key) {

                return (
                    encodeURIComponent(key) +
                    '=' +
                    encodeURIComponent(params[key])
                );

            })
            .join('&');

        var url =
            API +
            path +
            '?' +
            query;

        try {

            request.silent(
                url,

                function (data) {

                    if (success) {
                        success(data || {});
                    }

                },

                function () {

                    console.log(
                        '[TV RELEASES] API error:',
                        path
                    );

                    if (error) error();

                }
            );

        } catch (e) {

            console.log(
                '[TV RELEASES] request exception:',
                e
            );

            if (error) error();
        }
    }


    /*
     * ---------------------------------------------------------
     * DISCOVER
     * ---------------------------------------------------------
     */

    function discover(params, callback) {

        api(
            '/discover/tv',
            params,

            function (data) {

                callback(
                    data.results || []
                );

            },

            function () {

                callback([]);
            }
        );
    }


    /*
     * ---------------------------------------------------------
     * НОВЫЕ СЕРИАЛЫ
     *
     * Первый эпизод вышел за последние DAYS дней.
     * ---------------------------------------------------------
     */

    function loadNewSeries(callback) {

        var dates = getDates();

        discover({

            sort_by: 'first_air_date.desc',

            'first_air_date.gte':
                dates.from,

            'first_air_date.lte':
                dates.today,

            include_adult: false,

            'vote_count.gte': 0,

            page: 1

        }, function (items) {

            var result = [];

            items.forEach(function (item) {

                if (!item.first_air_date) {
                    return;
                }

                if (
                    item.first_air_date <
                    dates.from
                ) {
                    return;
                }

                if (
                    item.first_air_date >
                    dates.today
                ) {
                    return;
                }

                item._release_type =
                    'series';

                item._release_date =
                    item.first_air_date;

                item._release_label =
                    'Новый сериал';

                result.push(item);
            });


            result.sort(function (a, b) {

                return (
                    new Date(
                        b._release_date
                    ) -
                    new Date(
                        a._release_date
                    )
                );

            });

            callback(result);
        });
    }


    /*
     * ---------------------------------------------------------
     * НОВЫЕ СЕЗОНЫ
     *
     * Важный момент:
     *
     * Нельзя искать только по first_air_date,
     * потому что сериал мог начаться много лет назад,
     * а новый сезон вышел сейчас.
     *
     * Поэтому сначала получаем сериалы,
     * которые имеют air_date в нужном диапазоне,
     * затем проверяем их seasons.
     * ---------------------------------------------------------
     */

    function loadNewSeasons(callback) {

        var dates = getDates();

        discover({

            sort_by: 'popularity.desc',

            'air_date.gte':
                dates.from,

            'air_date.lte':
                dates.today,

            include_adult: false,

            page: 1

        }, function (items) {

            if (!items.length) {

                /*
                 * Запасной вариант.
                 * Некоторые TMDB/Lampa прокси могут
                 * игнорировать air_date.
                 */

                discover({

                    sort_by:
                        'first_air_date.desc',

                    'first_air_date.gte':
                        dates.from,

                    'first_air_date.lte':
                        dates.today,

                    include_adult: false,

                    page: 1

                }, function (fallback) {

                    checkShowsForSeasons(
                        fallback,
                        dates,
                        callback
                    );

                });

                return;
            }

            checkShowsForSeasons(
                items,
                dates,
                callback
            );
        });
    }


    /*
     * Проверка сезонов сериалов.
     */

    function checkShowsForSeasons(
        items,
        dates,
        callback
    ) {

        var result = [];

        var queue = items.slice(
            0,
            40
        );

        var index = 0;


        function next() {

            if (index >= queue.length) {

                result.sort(
                    function (a, b) {

                        return (
                            new Date(
                                b._release_date
                            ) -
                            new Date(
                                a._release_date
                            )
                        );

                    }
                );

                callback(result);

                return;
            }


            var item = queue[index++];

            api(
                '/tv/' + item.id,
                {},

                function (show) {

                    var seasons =
                        show.seasons || [];


                    var found =
                        seasons.filter(
                            function (season) {

                                return (

                                    season.season_number > 1 &&

                                    season.air_date &&

                                    season.air_date >=
                                        dates.from &&

                                    season.air_date <=
                                        dates.today

                                );

                            }
                        );


                    if (found.length) {

                        found.sort(
                            function (a, b) {

                                return (
                                    new Date(
                                        b.air_date
                                    ) -
                                    new Date(
                                        a.air_date
                                    )
                                );

                            }
                        );


                        var season =
                            found[0];


                        var copy =
                            $.extend(
                                true,
                                {},
                                item
                            );


                        copy._release_type =
                            'season';

                        copy._season =
                            season.season_number;

                        copy._release_date =
                            season.air_date;

                        copy._release_label =
                            'Сезон ' +
                            season.season_number;


                        copy.number_of_seasons =
                            show.number_of_seasons;

                        copy.number_of_episodes =
                            show.number_of_episodes;


                        result.push(copy);
                    }


                    /*
                     * Небольшая задержка,
                     * чтобы не забивать TMDB
                     * десятками запросов одновременно.
                     */

                    setTimeout(
                        next,
                        30
                    );

                },

                function () {

                    setTimeout(
                        next,
                        30
                    );

                }
            );
        }


        next();
    }


    /*
     * ---------------------------------------------------------
     * CARD
     * ---------------------------------------------------------
     */

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


    function buildCard(
        item,
        scroll,
        parent
    ) {

        var card;

        try {

            card =
                Lampa.Template.get(
                    'card',
                    item
                );

        } catch (e) {

            console.log(
                '[TV RELEASES] card error:',
                e
            );

            return;
        }


        var view =
            card.find(
                '.card__view'
            );


        if (!view.length) {
            view = card;
        }


        view.css(
            'position',
            'relative'
        );


        var label =
            $('<div class="tv-release-label">' +
                item._release_label +
              '</div>');


        var date =
            $('<div class="tv-release-date">' +
                formatDate(
                    item._release_date
                ) +
              '</div>');


        view.append(label);
        view.append(date);


        card.on(
            'hover:focus',
            function () {

                try {
                    scroll.update(
                        card,
                        true
                    );
                } catch (e) {}

            }
        );


        card.on(
            'hover:enter',
            function () {

                openCard(item);

            }
        );


        parent.append(card);
    }


    /*
     * ---------------------------------------------------------
     * COMPONENT
     * ---------------------------------------------------------
     */

    function ReleasesComponent() {

        var html =
            $('<div class="tv-releases"></div>');


        var scroll =
            new Lampa.Scroll({

                mask: true,

                over: true,

                step: 250,

                end_ratio: 2

            });


        var content =
            $('<div class="tv-releases-grid"></div>');


        var tabs =
            $('<div class="tv-releases-tabs">' +

                '<div class="tv-release-tab selector active" data-tab="0">' +
                    'Новые сезоны' +
                '</div>' +

                '<div class="tv-release-tab selector" data-tab="1">' +
                    'Новые сериалы' +
                '</div>' +

              '</div>');


        var lists = [
            [],
            []
        ];


        var currentTab = 0;

        var self = this;


        function renderTab() {

            content.empty();


            var list =
                lists[currentTab];


            if (!list.length) {

                content.append(
                    '<div class="tv-release-empty">' +
                        'Ничего не найдено' +
                    '</div>'
                );

                return;
            }


            list.forEach(
                function (item) {

                    buildCard(
                        item,
                        scroll,
                        content
                    );

                }
            );


            setTimeout(
                function () {

                    try {
                        Lampa.Layer.update();
                    } catch (e) {}

                },
                50
            );
        }


        this.create =
            function () {

                html.append(tabs);

                html.append(
                    scroll.render()
                );

                scroll.append(
                    content
                );


                tabs.find(
                    '.tv-release-tab'
                ).on(
                    'hover:enter',
                    function () {

                        currentTab =
                            Number(
                                $(this).attr(
                                    'data-tab'
                                )
                            );


                        tabs.find(
                            '.tv-release-tab'
                        ).removeClass(
                            'active'
                        );


                        $(this).addClass(
                            'active'
                        );


                        renderTab();


                        Lampa.Controller
                            .toggle(
                                'content'
                            );

                    }
                );


                self.activity.loader(
                    true
                );


                loadNewSeasons(
                    function (items) {

                        lists[0] =
                            items;


                        self.activity.loader(
                            false
                        );


                        renderTab();


                        /*
                         * Второй список грузим
                         * после первого.
                         */

                        loadNewSeries(
                            function (series) {

                                lists[1] =
                                    series;

                            }
                        );

                    }
                );


                return html;
            };


        this.render =
            function () {

                return html;

            };


        this.start =
            function () {

                Lampa.Controller.add(
                    'content',
                    {

                        toggle:
                            function () {

                                Lampa.Controller
                                    .collectionSet(
                                        scroll.render()
                                    );

                            },


                        left:
                            function () {

                                if (
                                    Navigator.canmove(
                                        'left'
                                    )
                                ) {

                                    Navigator.move(
                                        'left'
                                    );

                                } else {

                                    Lampa.Controller
                                        .toggle(
                                            'menu'
                                        );
                                }

                            },


                        right:
                            function () {

                                Navigator.move(
                                    'right'
                                );

                            },


                        up:
                            function () {

                                if (
                                    Navigator.canmove(
                                        'up'
                                    )
                                ) {

                                    Navigator.move(
                                        'up'
                                    );

                                } else {

                                    Lampa.Controller
                                        .toggle(
                                            'head'
                                        );
                                }

                            },


                        down:
                            function () {

                                Navigator.move(
                                    'down'
                                );

                            },


                        back:
                            function () {

                                Lampa.Activity
                                    .backward();

                            }

                    }
                );


                Lampa.Controller
                    .toggle(
                        'content'
                    );
            };


        this.pause =
            function () {};


        this.stop =
            function () {};


        this.destroy =
            function () {

                try {
                    scroll.destroy();
                } catch (e) {}

                html.remove();

            };
    }


    /*
     * ---------------------------------------------------------
     * REGISTER COMPONENT
     * ---------------------------------------------------------
     */

    function registerComponent() {

        if (
            Lampa.Component &&
            Lampa.Component.add
        ) {

            Lampa.Component.add(
                PLUGIN_NAME,
                ReleasesComponent
            );

        }

    }


    /*
     * ---------------------------------------------------------
     * MENU
     * ---------------------------------------------------------
     */

    function addMenu() {

        if (
            $('.tv-releases-menu').length
        ) {
            return;
        }


        var button =
            $('<li class="menu__item selector tv-releases-menu">' +

                '<div class="menu__ico">' +

                    '<svg viewBox="0 0 24 24" width="70" height="70">' +

                        '<path fill="currentColor" d="' +
                        'M19 3h-1V1h-2v2H8V1H6v2H5a3 3 0 0 0-3 3v13a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3V6a3 3 0 0 0-3-3zm1 16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-7h16v7zm0-9H4V6a1 1 0 0 1 1-1h1v2h2V5h8v2h2V5h1a1 1 0 0 1 1 1v4z"/>' +

                    '</svg>' +

                '</div>' +

                '<div class="menu__text">' +
                    'Новинки сериалов' +
                '</div>' +

              '</li>');


        button.on(
            'hover:enter',
            function () {

                Lampa.Activity.push({

                    url: '',

                    title:
                        'Новинки сериалов',

                    component:
                        PLUGIN_NAME,

                    page: 1

                });

            }
        );


        var menu =
            $('.menu .menu__list').eq(0);


        if (menu.length) {

            menu.append(button);

        } else {

            /*
             * На некоторых сборках меню
             * появляется чуть позже.
             */

            setTimeout(
                addMenu,
                500
            );
        }
    }


    /*
     * ---------------------------------------------------------
     * CSS
     * ---------------------------------------------------------
     */

    function addStyles() {

        if (
            $('#tv-releases-style').length
        ) {
            return;
        }


        $('body').append(

            '<style id="tv-releases-style">' +

            '.tv-releases-grid{' +
                'display:flex;' +
                'flex-wrap:wrap;' +
            '}' +

            '.tv-releases-grid .card{' +
                'position:relative;' +
            '}' +

            '.tv-release-label,' +
            '.tv-release-date{' +
                'position:absolute;' +
                'z-index:20;' +
                'background:rgba(0,0,0,.88);' +
                'color:#fff;' +
                'padding:.28em .55em;' +
                'border-radius:.25em;' +
                'font-size:.82em;' +
                'line-height:1.2;' +
            '}' +

            '.tv-release-label{' +
                'top:.5em;' +
                'left:.5em;' +
                'font-weight:bold;' +
            '}' +

            '.tv-release-date{' +
                'top:.5em;' +
                'right:.5em;' +
            '}' +

            '.tv-releases-tabs{' +
                'display:flex;' +
                'gap:.5em;' +
                'padding:1em 1em .7em;' +
            '}' +

            '.tv-release-tab{' +
                'padding:.55em 1em;' +
                'border-radius:.3em;' +
                'background:rgba(255,255,255,.08);' +
            '}' +

            '.tv-release-tab.active{' +
                'background:rgba(255,255,255,.22);' +
            '}' +

            '.tv-release-empty{' +
                'width:100%;' +
                'padding:4em;' +
                'text-align:center;' +
                'font-size:1.2em;' +
            '}' +

            '</style>'
        );
    }


    /*
     * ---------------------------------------------------------
     * BOOTSTRAP
     * ---------------------------------------------------------
     */

    function bootstrap() {

        if (
            typeof Lampa === 'undefined'
        ) {

            setTimeout(
                bootstrap,
                300
            );

            return;
        }


        if (window.appready) {

            startPlugin();

        } else if (
            Lampa.Listener &&
            Lampa.Listener.follow
        ) {

            Lampa.Listener.follow(
                'app',
                function (event) {

                    if (
                        event.type === 'ready'
                    ) {

                        startPlugin();

                    }

                }
            );


            /*
             * Защита от ситуации,
             * когда ready уже прошёл.
             */

            setTimeout(
                function () {

                    if (
                        window.appready &&
                        !window.tv_releases_plugin_started
                    ) {

                        startPlugin();

                    }

                },
                1500
            );

        } else {

            startPlugin();

        }
    }


    bootstrap();

})();