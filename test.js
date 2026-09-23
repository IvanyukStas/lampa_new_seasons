(function () {
    'use strict';

    function TrackMemoryPlugin() {
        // Ключ для сохранения данных в LocalStorage Лампы
        const STORAGE_KEY = 'lampa_serial_tracks';

        // Загрузка сохраненных дорожек
        function getSavedTracks() {
            try {
                return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
            } catch (e) {
                return {};
            }
        }

        // Сохранение дорожки для конкретного сериала
        function saveTrackForSerial(serialId, trackIndex) {
            const data = getSavedTracks();
            data[serialId] = trackIndex;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        }

        // Подписываемся на события встроенного плеера Lampa
        Lampa.Player.listener.follow('ready', function (e) {
            // Проверяем, что это сериал (card содержит информацию о медиафайле)
            const currentCard = Lampa.Player.opened_card();
            if (!currentCard || !currentCard.id) return;

            // Формируем уникальный ID для сериала или сезона
            // Если есть номер сезона, привязываемся к сезону, иначе к сериалу вообще
            const videoData = Lampa.Player.video && Lampa.Player.video();
            const seasonNum = videoData && videoData.season ? videoData.season : 'general';
            const serialId = 'serial_' + currentCard.id + '_s_' + seasonNum;

            const savedTracks = getSavedTracks();
            const targetTrackIndex = savedTracks[serialId];

            // Получаем список доступных аудиодорожек в запущенной серии
            // Метод зависит от типа плеера, обычно это Lampa.Player.tracks() или видео-элемент
            setTimeout(() => {
                const tracks = Lampa.Player.tracks ? Lampa.Player.tracks() : [];
                
                if (tracks && tracks.length > 0) {
                    if (targetTrackIndex !== undefined) {
                        // Проверяем, существует ли дорожка с таким индексом в новой серии
                        if (tracks[targetTrackIndex]) {
                            // Автоматически переключаем на сохраненную дорожку
                            Lampa.Player.setTrack(targetTrackIndex);
                            Lampa.Noty.show('Авто-выбор дорожки #' + (targetTrackIndex + 1));
                        } else {
                            // Если дорожки с таким номером нет в новой серии — сбрасываем и просим выбрать
                            Lampa.Noty.show('Сохраненная дорожка отсутствует. Выберите заново.');
                            listenToManualSelection(serialId);
                        }
                    } else {
                        // Если дорожка еще не сохранялась для этого сериала
                        listenToManualSelection(serialId);
                    }
                }
            }, 1500); // Небольшая задержка, чтобы плеер успел проинициализировать дорожки
        });

        // Функция отслеживания ручного выбора дорожки пользователем
        function listenToManualSelection(serialId) {
            // Перехватываем событие изменения аудиодорожки в интерфейсе плеера
            Lampa.Player.listener.follow('track_changed', function (e) {
                if (e.type === 'audio' && e.index !== undefined) {
                    saveTrackForSerial(serialId, e.index);
                    Lampa.Noty.show('Дорожка #' + (e.index + 1) + ' запомнена для следующих серий');
                }
            });
        }
    }

    // Регистрируем плагин в системе Lampa, когда она готова
    if (window.appready) {
        TrackMemoryPlugin();
    } else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type == 'ready') TrackMemoryPlugin();
        });
    }
})();
