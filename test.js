(function () {
    'use strict';

    function TrackMemoryPlugin() {
        const STORAGE_KEY = 'lampa_serial_tracks';

        function getSavedTracks() {
            try {
                return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
            } catch (e) {
                return {};
            }
        }

        function saveTrackForSerial(serialId, trackIndex) {
            try {
                const data = getSavedTracks();
                data[serialId] = trackIndex;
                localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
            } catch (e) {
                console.log('LampaTrackMemory Error:', e);
            }
        }

        // Проверяем существование плеера и его слушателя
        if (!window.Lampa || !Lampa.Player || !Lampa.Player.listener) return;

        Lampa.Player.listener.follow('ready', function () {
            try {
                // Безопасное получение карточки релиза
                const currentCard = typeof Lampa.Player.opened_card === 'function' ? Lampa.Player.opened_card() : null;
                if (!currentCard || !currentCard.id) return;

                // Безопасное получение данных о видео (сезон/серия)
                const videoData = typeof Lampa.Player.video === 'function' ? Lampa.Player.video() : null;
                const seasonNum = videoData && videoData.season !== undefined ? videoData.season : 'general';
                
                // Уникальный ID для сезона конкретного сериала
                const serialId = 'serial_' + currentCard.id + '_s_' + seasonNum;

                const savedTracks = getSavedTracks();
                const targetTrackIndex = savedTracks[serialId];

                // Ждем буферизации дорожек торрента плеером
                setTimeout(function () {
                    try {
                        let tracks = [];
                        
                        if (typeof Lampa.Player.tracks === 'function') {
                            tracks = Lampa.Player.tracks();
                        } 
                        
                        if ((!tracks || tracks.length === 0) && Lampa.Player.video) {
                            const vElement = Lampa.Player.video();
                            if (vElement && vElement.audioTracks) tracks = vElement.audioTracks;
                        }

                        if (tracks && tracks.length > 0 && targetTrackIndex !== undefined) {
                            if (tracks[targetTrackIndex]) {
                                // Переключаем аудиодорожку
                                if (typeof Lampa.Player.setTrack === 'function') {
                                    Lampa.Player.setTrack(targetTrackIndex);
                                } else if (typeof Lampa.Player.setAudio === 'function') {
                                    Lampa.Player.setAudio(targetTrackIndex);
                                }
                                Lampa.Noty.show('Авто-выбор аудиодорожки №' + (targetTrackIndex + 1));
                            } else {
                                Lampa.Noty.show('Сохраненная дорожка отсутствует в серии. Выберите заново.');
                                listenToManualSelection(serialId);
                            }
                        } else {
                            listenToManualSelection(serialId);
                        }
                    } catch (err) {
                        console.log('LampaTrackMemory Inner Error:', err);
                    }
                }, 3000);

            } catch (err) {
                console.log('LampaTrackMemory Ready Error:', err);
            }
        });

        function listenToManualSelection(serialId) {
            Lampa.Player.listener.follow('track_changed', function (e) {
                if (e && (e.type === 'audio' || e.track === 'audio') && e.index !== undefined) {
                    saveTrackForSerial(serialId, e.index);
                    Lampa.Noty.show('Дорожка №' + (e.index + 1) + ' запомненна для сезона');
                }
            });
        }
    }

    // Безопасный запуск при полной готовности приложения
    if (window.appready) {
        TrackMemoryPlugin();
    } else {
        if (window.Lampa && Lampa.Listener) {
            Lampa.Listener.follow('app', function (e) {
                if (e.type == 'ready') TrackMemoryPlugin();
            });
        }
    }
})();
