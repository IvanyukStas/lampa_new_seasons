(function () {
    'use strict';

    /*
     * Lampa GST Audio Memory
     * Версия: 1.0.0
     *
     * Назначение:
     *   Автоматический выбор и запоминание аудиодорожки
     *   для TorrServer-gst.
     *
     * Работает только с:
     *   /gst/{hash}/master.m3u8
     *
     * Не изменяет обычный:
     *   /stream/...
     */

    if (window.lampa_gst_audio_memory_loaded) return;
    window.lampa_gst_audio_memory_loaded = true;

    var PLUGIN_NAME = 'GST Audio Memory';
    var VERSION = '1.0.0';

    var STORAGE_KEY = 'lampa_gst_audio_memory_v1';

    var DEBUG = true;

    var state = {
        lastUrl: '',
        lastProbe: null,
        currentKey: '',
        currentTracks: [],
        currentSelected: null
    };

    /*
     * ---------------------------------------------------------
     * LOG
     * ---------------------------------------------------------
     */

    function log() {
        if (!DEBUG) return;

        var args = Array.prototype.slice.call(arguments);

        args.unshift('[GST Audio Memory]');

        try {
            console.log.apply(console, args);
        } catch (e) {}
    }


    /*
     * ---------------------------------------------------------
     * STORAGE
     * ---------------------------------------------------------
     */

    function loadMemory() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);

            if (!raw) return {};

            var data = JSON.parse(raw);

            if (!data || typeof data !== 'object') {
                return {};
            }

            return data;
        } catch (e) {
            log('Ошибка чтения памяти:', e);
            return {};
        }
    }


    function saveMemory(data) {
        try {
            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify(data)
            );

            log('Память сохранена:', data);
        } catch (e) {
            log('Ошибка записи памяти:', e);
        }
    }


    function getMemory(key) {
        var data = loadMemory();

        return data[key] || null;
    }


    function setMemory(key, track) {
        var data = loadMemory();

        data[key] = {
            title: track.title || '',
            language: track.language || '',
            codec: track.codec || '',
            channels: Number(track.channels || 0),
            rate: Number(track.rate || 0),
            index: Number(track.index || 0),
            saved: Date.now()
        };

        saveMemory(data);

        log('Сохранена дорожка:', key, data[key]);
    }


    function removeMemory(key) {
        var data = loadMemory();

        if (data[key]) {
            delete data[key];
            saveMemory(data);
        }
    }


    /*
     * ---------------------------------------------------------
     * URL
     * ---------------------------------------------------------
     */

    function parseGSTUrl(url) {
        if (!url) return null;

        var match = url.match(
            /\/gst\/([^\/]+)\/master\.m3u8(?:\?([^#]*))?/i
        );

        if (!match) {
            return null;
        }

        var hash = match[1];
        var query = match[2] || '';

        var params = {};

        query.split('&').forEach(function (item) {
            if (!item) return;

            var parts = item.split('=');

            var key = decodeURIComponent(parts[0] || '');

            var value = decodeURIComponent(
                parts.slice(1).join('=') || ''
            );

            params[key] = value;
        });

        return {
            hash: hash,
            params: params
        };
    }


    /*
     * ---------------------------------------------------------
     * PROBE URL
     * ---------------------------------------------------------
     */

    function makeProbeUrl(baseUrl, hash) {
        var clean = baseUrl.replace(/\/+$/, '');

        return clean +
            '/gst/' +
            encodeURIComponent(hash) +
            '/probe';
    }


    function getBaseFromStreamUrl(url) {
        try {
            var parsed = new URL(url);

            return parsed.protocol +
                '//' +
                parsed.host;
        } catch (e) {
            return '';
        }
    }


    /*
     * ---------------------------------------------------------
     * PROBE
     * ---------------------------------------------------------
     */

    function requestProbe(url, callback) {
        var parsed = parseGSTUrl(url);

        if (!parsed) {
            callback(null);
            return;
        }

        var base = getBaseFromStreamUrl(url);

        if (!base) {
            callback(null);
            return;
        }

        var probeUrl = makeProbeUrl(
            base,
            parsed.hash
        );

        log('PROBE:', probeUrl);

        $.ajax({
            url: probeUrl,
            method: 'GET',
            dataType: 'json',
            timeout: 10000,

            success: function (data) {

                log('PROBE RESULT:', data);

                callback(data);
            },

            error: function (xhr, status, error) {

                log(
                    'PROBE ERROR:',
                    status,
                    error,
                    xhr && xhr.responseText
                );

                callback(null);
            }
        });
    }


    /*
     * ---------------------------------------------------------
     * NORMALIZE AUDIO TRACK
     * ---------------------------------------------------------
     */

    function normalizeTrack(track, fallbackIndex) {

        var codec = '';
        var channels = 0;
        var rate = 0;
        var language = '';
        var title = '';
        var index = fallbackIndex;

        if (!track) {
            return null;
        }

        title = String(
            track.Title ||
            track.title ||
            ''
        );

        language = String(
            track.Language ||
            track.language ||
            ''
        );

        channels = Number(
            track.Channels ||
            track.channels ||
            0
        );

        rate = Number(
            track.Rate ||
            track.rate ||
            0
        );

        codec = String(
            track.Codec ||
            track.codec ||
            ''
        );

        if (
            typeof track.Index !== 'undefined'
        ) {
            index = Number(track.Index);
        }

        return {
            index: index,
            title: title,
            language: language,
            codec: codec,
            channels: channels,
            rate: rate
        };
    }


    /*
     * ---------------------------------------------------------
     * EXTRACT AUDIO TRACKS
     * ---------------------------------------------------------
     */

    function extractAudioTracks(probe) {

        if (!probe) return [];

        var tracks =
            probe.Tracks ||
            probe.tracks ||
            [];

        var result = [];

        for (var i = 0; i < tracks.length; i++) {

            var item = tracks[i];

            var type = String(
                item.Type ||
                item.type ||
                ''
            ).toLowerCase();

            if (type !== 'audio') {
                continue;
            }

            var track = normalizeTrack(
                item,
                result.length
            );

            if (track) {
                result.push(track);
            }
        }

        return result;
    }


    /*
     * ---------------------------------------------------------
     * TRACK COMPARISON
     * ---------------------------------------------------------
     */

    function normalizeText(value) {

        return String(value || '')
            .trim()
            .toLowerCase()
            .replace(/\s+/g, ' ');
    }


    function sameTrack(a, b) {

        if (!a || !b) return false;

        var aTitle = normalizeText(a.title);
        var bTitle = normalizeText(b.title);

        var aLang = normalizeText(a.language);
        var bLang = normalizeText(b.language);

        /*
         * Главное совпадение:
         *
         * название + язык
         */

        if (
            aTitle &&
            bTitle &&
            aTitle === bTitle &&
            (!aLang || !bLang || aLang === bLang)
        ) {
            return true;
        }

        /*
         * Если название отсутствует,
         * используем язык + характеристики.
         */

        if (
            !aTitle &&
            !bTitle &&
            aLang &&
            bLang &&
            aLang === bLang &&
            Number(a.channels || 0) ===
                Number(b.channels || 0)
        ) {
            return true;
        }

        return false;
    }


    /*
     * ---------------------------------------------------------
     * FIND SAVED TRACK
     * ---------------------------------------------------------
     */

    function findSavedTrack(tracks, saved) {

        if (!saved || !tracks.length) {
            return null;
        }

        /*
         * 1. Точное название + язык
         */

        for (var i = 0; i < tracks.length; i++) {

            if (
                normalizeText(tracks[i].title) ===
                normalizeText(saved.title) &&

                normalizeText(tracks[i].language) ===
                normalizeText(saved.language)
            ) {
                return tracks[i];
            }
        }


        /*
         * 2. Название
         */

        if (saved.title) {

            for (var j = 0; j < tracks.length; j++) {

                if (
                    normalizeText(tracks[j].title) ===
                    normalizeText(saved.title)
                ) {
                    return tracks[j];
                }
            }
        }


        /*
         * 3. Язык + количество каналов
         */

        if (saved.language) {

            for (var k = 0; k < tracks.length; k++) {

                if (
                    normalizeText(tracks[k].language) ===
                    normalizeText(saved.language) &&

                    Number(tracks[k].channels || 0) ===
                    Number(saved.channels || 0)
                ) {
                    return tracks[k];
                }
            }
        }


        return null;
    }


    /*
     * ---------------------------------------------------------
     * CHOOSE DEFAULT TRACK
     * ---------------------------------------------------------
     */

    function chooseDefaultTrack(tracks) {

        if (!tracks.length) {
            return null;
        }

        /*
         * Если есть русский язык,
         * выбираем первую русскую.
         */

        for (var i = 0; i < tracks.length; i++) {

            if (
                normalizeText(tracks[i].language) === 'ru'
            ) {
                return tracks[i];
            }
        }

        /*
         * Иначе первая дорожка.
         */

        return tracks[0];
    }


    /*
     * ---------------------------------------------------------
     * MOVIE / SERIAL KEY
     * ---------------------------------------------------------
     */

    function getContentKey() {

        var movie = null;

        try {

            if (
                Lampa &&
                Lampa.Activity &&
                Lampa.Activity.active &&
                Lampa.Activity.active()
            ) {
                var active =
                    Lampa.Activity.active();

                if (active && active.movie) {
                    movie = active.movie;
                }
            }

        } catch (e) {}


        /*
         * Запасной вариант:
         * берём данные из Player.
         */

        if (!movie) {

            try {

                if (
                    Lampa.Player &&
                    Lampa.Player.current
                ) {
                    movie = Lampa.Player.current;
                }

            } catch (e2) {}
        }


        var name = '';
        var season = '';
        var tmdb = '';
        var imdb = '';
        var kp = '';

        if (movie) {

            name =
                movie.title ||
                movie.name ||
                movie.original_title ||
                movie.original_name ||
                '';

            season =
                movie.season ||
                movie.season_number ||
                movie.seasonNumber ||
                '';

            tmdb =
                movie.id ||
                movie.tmdb_id ||
                '';

            imdb =
                movie.imdb_id ||
                '';

            kp =
                movie.kinopoisk_id ||
                movie.kp_id ||
                '';
        }


        /*
         * Если идентификатора нет,
         * используем название.
         */

        var identity =
            tmdb ||
            imdb ||
            kp ||
            normalizeText(name);

        if (!identity) {
            identity = 'unknown';
        }

        /*
         * Сезон отдельно.
         *
         * Серии одного сезона должны
         * использовать одну настройку.
         */

        return (
            'content=' +
            identity +
            '|season=' +
            (season || '0')
        );
    }


    /*
     * ---------------------------------------------------------
     * URL KEY FALLBACK
     * ---------------------------------------------------------
     */

    function getFallbackKey(parsed) {

        if (!parsed) return '';

        return (
            'gst=' +
            parsed.hash +
            '|index=' +
            (parsed.params.index || '0')
        );
    }


    /*
     * ---------------------------------------------------------
     * MODIFY URL
     * ---------------------------------------------------------
     */

    function setAudioInUrl(url, audioIndex) {

        if (!url) return url;

        try {

            var parsed = new URL(url);

            parsed.searchParams.set(
                'audio',
                String(audioIndex)
            );

            return parsed.toString();

        } catch (e) {

            /*
             * Старый WebView fallback.
             */

            if (
                /[?&]audio=/i.test(url)
            ) {

                return url.replace(
                    /([?&])audio=[^&]*/i,
                    '$1audio=' +
                    encodeURIComponent(audioIndex)
                );
            }

            return url +
                (
                    url.indexOf('?') >= 0
                        ? '&'
                        : '?'
                ) +
                'audio=' +
                encodeURIComponent(audioIndex);
        }
    }


    /*
     * ---------------------------------------------------------
     * MAIN PROCESS
     * ---------------------------------------------------------
     */

    function processURL(url, done) {

        if (!url) {
            done(url);
            return;
        }

        var parsed = parseGSTUrl(url);

        if (!parsed) {
            done(url);
            return;
        }

        /*
         * Уже обработанный URL
         */

        if (
            state.lastUrl === url &&
            state.currentSelected
        ) {
            done(url);
            return;
        }

        state.lastUrl = url;

        log('GST URL:', url);
        log('HASH:', parsed.hash);
        log('INDEX:', parsed.params.index);
        log('AUDIO:', parsed.params.audio);


        requestProbe(url, function (probe) {

            if (!probe) {
                log('PROBE отсутствует — оставляем URL');

                done(url);
                return;
            }

            var tracks =
                extractAudioTracks(probe);

            state.lastProbe = probe;
            state.currentTracks = tracks;

            log(
                'Найдено аудиодорожек:',
                tracks.length,
                tracks
            );


            if (!tracks.length) {
                done(url);
                return;
            }


            /*
             * Ключ сериала/фильма
             */

            var key = getContentKey();

            /*
             * Если контекст Lampa пока недоступен,
             * используем hash.
             */

            if (!key || key === 'content=unknown|season=0') {
                key = getFallbackKey(parsed);
            }

            state.currentKey = key;

            log('KEY:', key);


            /*
             * Ищем сохранённую дорожку.
             */

            var saved = getMemory(key);

            log('SAVED:', saved);


            var selected = null;


            if (saved) {

                selected =
                    findSavedTrack(
                        tracks,
                        saved
                    );

                if (selected) {

                    log(
                        'Найдена сохранённая дорожка:',
                        selected
                    );

                } else {

                    log(
                        'Сохранённая дорожка отсутствует в этой серии'
                    );
                }
            }


            /*
             * Если сохранения нет,
             * выбираем русский.
             */

            if (!selected) {

                selected =
                    chooseDefaultTrack(tracks);

                log(
                    'Выбрана дорожка по умолчанию:',
                    selected
                );
            }


            if (!selected) {
                done(url);
                return;
            }


            state.currentSelected = selected;


            /*
             * Запоминаем выбранную дорожку.
             */

            if (!saved || !findSavedTrack(tracks, saved)) {

                setMemory(
                    key,
                    selected
                );
            }


            /*
             * Меняем audio=N
             */

            var newUrl =
                setAudioInUrl(
                    url,
                    selected.index
                );

            log(
                'FINAL URL:',
                newUrl
            );


            done(newUrl);
        });
    }


    /*
     * ---------------------------------------------------------
     * INTERCEPT LAMPA PLAYER
     * ---------------------------------------------------------
     */

    function installPlayerHook() {

        if (
            !window.Lampa ||
            !Lampa.Player
        ) {
            return false;
        }

        /*
         * В современных Lampa есть Player.listener.
         *
         * Используем событие create,
         * если оно доступно.
         */

        if (
            Lampa.Player.listener &&
            typeof Lampa.Player.listener.follow === 'function'
        ) {

            Lampa.Player.listener.follow(
                'create',
                function (event) {

                    log('PLAYER CREATE:', event);

                    if (!event) return;

                    var url =
                        event.url ||
                        (
                            event.object &&
                            event.object.url
                        ) ||
                        '';

                    if (!url) return;

                    if (!parseGSTUrl(url)) {
                        return;
                    }

                    log(
                        'Обнаружен GST playback:',
                        url
                    );

                    processURL(
                        url,
                        function (newUrl) {

                            if (
                                newUrl &&
                                newUrl !== url
                            ) {

                                /*
                                 * В зависимости от версии Lampa
                                 * объект может быть:
                                 *
                                 * event
                                 * event.object
                                 */

                                if (event.url) {
                                    event.url = newUrl;
                                }

                                if (
                                    event.object &&
                                    event.object.url
                                ) {
                                    event.object.url =
                                        newUrl;
                                }

                                log(
                                    'GST URL изменён:',
                                    newUrl
                                );
                            }
                        }
                    );
                }
            );

            log('Player listener установлен');

            return true;
        }

        return false;
    }


    /*
     * ---------------------------------------------------------
     * FALLBACK — PATCH Player.play
     * ---------------------------------------------------------
     *
     * Используется только если listener create
     * недоступен.
     */

    function installPlayerPlayFallback() {

        if (
            !window.Lampa ||
            !Lampa.Player ||
            typeof Lampa.Player.play !== 'function'
        ) {
            return false;
        }

        if (Lampa.Player.__gst_audio_memory_patched) {
            return true;
        }

        /*
         * Важно:
         *
         * async probe нельзя нормально выполнить
         * до синхронного запуска через обычный patch.
         *
         * Поэтому fallback здесь только
         * диагностический.
         */

        Lampa.Player.__gst_audio_memory_patched = true;

        var original =
            Lampa.Player.play;

        Lampa.Player.play =
            function (object) {

                try {

                    var url =
                        typeof object === 'string'
                            ? object
                            : object && object.url;

                    if (url && parseGSTUrl(url)) {

                        log(
                            'Player.play GST:',
                            url
                        );

                        /*
                         * Если URL уже содержит audio,
                         * не меняем его.
                         *
                         * Основной механизм работает
                         * через Player.listener.
                         */
                    }

                } catch (e) {
                    log(
                        'play fallback error:',
                        e
                    );
                }

                return original.apply(
                    this,
                    arguments
                );
            };

        log(
            'Player.play fallback установлен'
        );

        return true;
    }


    /*
     * ---------------------------------------------------------
     * SETTINGS / CLEAR
     * ---------------------------------------------------------
     */

    function addSettings() {

        try {

            if (
                !Lampa.SettingsApi ||
                !Lampa.SettingsApi.addComponent
            ) {
                return;
            }

            Lampa.SettingsApi.addComponent({
                component: 'gst_audio_memory',
                icon: '🎧',
                name: 'GST Audio Memory'
            });

            Lampa.SettingsApi.addParam({
                component: 'gst_audio_memory',

                param: {
                    name: 'gst_audio_memory_debug',
                    type: 'select',

                    values: {
                        on: 'Включён',
                        off: 'Выключен'
                    },

                    default: DEBUG
                        ? 'on'
                        : 'off'
                },

                field: {
                    name: 'Отладка'
                }
            });

            Lampa.SettingsApi.addParam({
                component: 'gst_audio_memory',

                param: {
                    name: 'gst_audio_memory_clear',
                    type: 'button'
                },

                field: {
                    name: 'Очистить сохранённые дорожки'
                },

                onChange: function () {

                    try {
                        localStorage.removeItem(
                            STORAGE_KEY
                        );
                    } catch (e) {}

                    if (
                        Lampa.Notifier &&
                        Lampa.Notifier.show
                    ) {

                        Lampa.Notifier.show(
                            'Сохранённые аудиодорожки очищены'
                        );
                    }
                }
            });

        } catch (e) {

            log(
                'Settings error:',
                e
            );
        }
    }


    /*
     * ---------------------------------------------------------
     * DEBUG PANEL
     * ---------------------------------------------------------
     */

    function debugInfo() {

        log('--------------------------------');
        log('VERSION:', VERSION);
        log('LAST URL:', state.lastUrl);
        log('KEY:', state.currentKey);
        log('TRACKS:', state.currentTracks);
        log('SELECTED:', state.currentSelected);
        log('--------------------------------');
    }


    /*
     * ---------------------------------------------------------
     * INIT
     * ---------------------------------------------------------
     */

    function init() {

        if (!window.Lampa) {
            setTimeout(init, 1000);
            return;
        }

        log(
            PLUGIN_NAME +
            ' v' +
            VERSION +
            ' INIT'
        );

        addSettings();

        var installed =
            installPlayerHook();

        if (!installed) {

            log(
                'Player.listener недоступен'
            );

            installPlayerPlayFallback();
        }

        debugInfo();
    }


    /*
     * ---------------------------------------------------------
     * WAIT LAMPA
     * ---------------------------------------------------------
     */

    if (
        window.appready ||
        (
            window.Lampa &&
            Lampa.Player
        )
    ) {

        setTimeout(
            init,
            100
        );

    } else if (
        window.Lampa &&
        Lampa.Listener
    ) {

        Lampa.Listener.follow(
            'app',
            function (event) {

                if (
                    event &&
                    event.type === 'ready'
                ) {
                    init();
                }
            }
        );

    } else {

        setTimeout(
            init,
            1500
        );
    }

})();