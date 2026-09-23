(function () {
    'use strict';

    if (window.__GST_AUDIO_TEST__) {
        console.log('[GST-AUDIO-TEST] Уже запущен');
        return;
    }

    window.__GST_AUDIO_TEST__ = true;

    var PREFIX = '[GST-AUDIO-TEST]';
    var installed = false;
    var originalPlay = null;

    function log() {
        var args = Array.prototype.slice.call(arguments);
        args.unshift(PREFIX);
        console.log.apply(console, args);
    }

    function findUrl(obj, path) {
        path = path || 'root';

        if (!obj) return null;

        if (typeof obj === 'string') {
            if (
                obj.indexOf('http://') === 0 ||
                obj.indexOf('https://') === 0 ||
                obj.indexOf('/gst/') !== -1 ||
                obj.indexOf('.m3u8') !== -1
            ) {
                return {
                    path: path,
                    value: obj
                };
            }

            return null;
        }

        if (typeof obj !== 'object') return null;

        var keys = [
            'url',
            'file',
            'src',
            'stream',
            'link',
            'uri',
            'source'
        ];

        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];

            if (obj[key] && typeof obj[key] === 'string') {
                var result = findUrl(obj[key], path + '.' + key);
                if (result) return result;
            }
        }

        return null;
    }

    function analyseUrl(url) {
        if (!url) return;

        log('URL:', url);

        var isGST =
            url.indexOf('/gst/') !== -1 ||
            url.indexOf('TorrServer-gst') !== -1 ||
            url.indexOf('master.m3u8') !== -1;

        log('GST/HLS:', isGST ? 'ДА' : 'НЕТ');

        try {
            var u = new URL(
                url,
                window.location.href
            );

            log('HOST:', u.host);
            log('PATH:', u.pathname);

            var params = {};

            u.searchParams.forEach(function (value, key) {
                params[key] = value;
            });

            log('PARAMS:', params);

            if (u.pathname.indexOf('/gst/') !== -1) {
                var match = u.pathname.match(
                    /\/gst\/([^\/]+)/
                );

                if (match) {
                    log('GST HASH:', match[1]);
                }
            }

            if (u.searchParams.has('audio')) {
                log(
                    'AUDIO INDEX:',
                    u.searchParams.get('audio')
                );
            }

            if (u.searchParams.has('index')) {
                log(
                    'INDEX:',
                    u.searchParams.get('index')
                );
            }

        } catch (e) {
            log('Ошибка разбора URL:', e);
        }
    }

    function install() {
        if (installed) return true;

        if (
            !window.Lampa ||
            !Lampa.Player ||
            typeof Lampa.Player.play !== 'function'
        ) {
            return false;
        }

        originalPlay = Lampa.Player.play;

        if (
            originalPlay.__GST_AUDIO_TEST_WRAPPED__
        ) {
            installed = true;
            return true;
        }

        Lampa.Player.play = function () {

            log('====================================');
            log('Lampa.Player.play() ВЫЗВАН');

            try {
                log(
                    'Количество аргументов:',
                    arguments.length
                );

                for (var i = 0; i < arguments.length; i++) {
                    var arg = arguments[i];

                    log(
                        'ARG[' + i + ']:',
                        arg
                    );

                    if (
                        arg &&
                        typeof arg === 'object'
                    ) {
                        try {
                            log(
                                'ARG[' + i + '] JSON:',
                                JSON.parse(
                                    JSON.stringify(arg)
                                )
                            );
                        } catch (e) {}
                    }

                    var found = findUrl(
                        arg,
                        'arguments[' + i + ']'
                    );

                    if (found) {
                        log(
                            'НАЙДЕН URL:',
                            found.path
                        );

                        analyseUrl(
                            found.value
                        );

                        try {
                            localStorage.setItem(
                                'gst_audio_test_last_url',
                                found.value
                            );
                        } catch (e) {}
                    }
                }

            } catch (e) {
                log(
                    'Ошибка диагностики:',
                    e
                );
            }

            log(
                'Передаём управление оригинальному Player.play()'
            );

            return originalPlay.apply(
                this,
                arguments
            );
        };

        Lampa.Player.play.__GST_AUDIO_TEST_WRAPPED__ = true;

        installed = true;

        log('====================================');
        log('ДИАГНОСТИЧЕСКИЙ ПЕРЕХВАТ УСТАНОВЛЕН');
        log('Lampa.Player.play успешно перехвачен');
        log('Воспроизведение НЕ изменяется');
        log('====================================');

        return true;
    }

    var attempts = 0;

    var timer = setInterval(function () {

        attempts++;

        if (install()) {
            clearInterval(timer);
            return;
        }

        if (attempts >= 120) {
            clearInterval(timer);

            log(
                'ОШИБКА: Lampa.Player.play не найден'
            );

            log(
                'Lampa:',
                !!window.Lampa
            );

            log(
                'Player:',
                !!(
                    window.Lampa &&
                    Lampa.Player
                )
            );
        }

    }, 500);

    try {
        if (
            window.Lampa &&
            Lampa.Listener &&
            typeof Lampa.Listener.follow === 'function'
        ) {
            Lampa.Listener.follow(
                'app',
                function (event) {

                    log(
                        'Lampa app event:',
                        event
                    );

                    install();
                }
            );
        }
    } catch (e) {
        log(
            'Ошибка подключения app listener:',
            e
        );
    }

    log(
        'GST Audio Test загружен'
    );

})();