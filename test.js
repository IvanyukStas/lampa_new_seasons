(function () {
    'use strict';

    window.GST_AUDIO_TEST_2026 = true;

    console.log('====================================');
    console.log('[GST-TEST] ПЛАГИН ЗАГРУЖЕН');
    console.log('[GST-TEST] Lampa:', !!window.Lampa);
    console.log('[GST-TEST] URL:', window.location.href);
    console.log('====================================');

    try {
        if (window.Lampa && Lampa.Notifier) {
            Lampa.Notifier.show({
                title: 'GST Audio Test',
                text: 'Плагин ЗАГРУЖЕН',
                time: 5000
            });
        } else {
            alert('GST Audio Test: ПЛАГИН ЗАГРУЖЕН');
        }
    } catch (e) {
        alert('GST Audio Test: ПЛАГИН ЗАГРУЖЕН');
    }
})();