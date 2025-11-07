// ==UserScript==
// @name         Fetch Lead Data from Bitrix CRM with Calendar
// @namespace    http://tampermonkey.net/
// @version      0.71
// @description  Extract lead data from Bitrix CRM and display events in a calendar modal
// @author       You
// @match        https://bitrix.triline.kz/*
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

    let isRequestInProgress = false; // Флаг для блокировки повторных запросов

    // Подключение стилей и скриптов для FullCalendar через CDN
    GM_addStyle(`
        /* FullCalendar Styles */
        @import url('https://cdnjs.cloudflare.com/ajax/libs/fullcalendar/3.2.0/fullcalendar.min.css');

        /* Стиль для спиннера */
        .spinner {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            border: 4px solid rgba(231, 247, 13, 0.3);
            border-top: 4px solid #7e0909ff;
            border-radius: 50%;
            width: 50px;
            height: 50px;
            animation: spin 1s linear infinite;
        }

        @keyframes spin {
            0% { transform: translate(-50%, -50%) rotate(0deg); }
            100% { transform: translate(-50%, -50%) rotate(360deg); }
        }
    `);

    // Сначала подключаем jQuery
    const jQueryScript = document.createElement('script');
    jQueryScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/jquery/3.6.0/jquery.min.js';
    document.body.appendChild(jQueryScript);

    jQueryScript.onload = () => {
        // Затем подключаем moment.js (нужен для FullCalendar)
        const momentScript = document.createElement('script');
        momentScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/moment.js/2.29.1/moment.min.js';
        document.body.appendChild(momentScript);

        momentScript.onload = () => {
            // После того как jQuery и moment.js загружены, подключаем FullCalendar
            const calendarScript = document.createElement('script');
            calendarScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/fullcalendar/3.2.0/fullcalendar.min.js';
            document.body.appendChild(calendarScript);

            calendarScript.onload = () => {
                const localeScript = document.createElement('script');
                localeScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/fullcalendar/3.2.0/locale/ru.js';
                document.body.appendChild(localeScript);

                localeScript.onload = () => {
                    initializeCalendar(); // Инициализируем календарь после загрузки всех зависимостей
                };
            };
        };
    };

    // Модальное окно
    function createModal(content) {
        const modal = document.createElement('div');
        modal.style.position = 'fixed';
        modal.style.top = '0';
        modal.style.left = '0';
        modal.style.width = '100vw';
        modal.style.height = '100vh';
        modal.style.backgroundColor = 'rgba(0, 0, 0, 0.62)';
        modal.style.display = 'flex';
        modal.style.justifyContent = 'center';
        modal.style.alignItems = 'center';
        modal.style.zIndex = '9999';

        const modalContent = document.createElement('div');
        modalContent.style.backgroundColor = 'rgba(191, 191, 191, 0.88)';
        modalContent.style.padding = '20px';
        modalContent.style.borderRadius = '8px';
        modalContent.style.width = '80vw';
        modalContent.style.height = '80vh';
        modalContent.style.overflowY = 'auto';

        const closeBtn = document.createElement('button');
        closeBtn.textContent = 'Закрыть';
        closeBtn.style.position = 'absolute';
        closeBtn.style.top = '10px';
        closeBtn.style.right = '10px';
        closeBtn.style.padding = '5px 10px';
        closeBtn.style.fontSize = '16px';
        closeBtn.style.cursor = 'pointer';
        closeBtn.onclick = () => document.body.removeChild(modal);

        modalContent.appendChild(closeBtn);
        modalContent.appendChild(content);
        modal.appendChild(modalContent);

        document.body.appendChild(modal);
    }

    // Функция для отображения спиннера
    function showSpinner() {
        const spinner = document.createElement('div');
        spinner.classList.add('spinner');
        document.body.appendChild(spinner);
        return spinner;
    }

    // Функция для скрытия спиннера
    function hideSpinner(spinner) {
        document.body.removeChild(spinner);
    }

    // Функция для инициализации календаря
    function initializeCalendar() {
        // Функция для извлечения данных о лидах
        function extractLeadData(gridWrapper) {
            const leadData = [];
            const rows = gridWrapper.querySelectorAll('.main-grid-row');
            rows.forEach(row => {
                const rowData = [];
                const cells = row.querySelectorAll('.main-grid-cell-content');
                cells.forEach(cell => {
                    if (cell.dataset.preventDefault && cell.innerText != null) {
                        let cellText = cell.innerText.trim();
                        const parts = cellText.split('\n\t\t\t\t\t').map(part => part.trim()).filter(part => part.length > 0);

                        if (parts.length > 1) {
                            const date = parts[0];
                            const task = parts.slice(1).join(" ");
                            rowData.push([date, task]);
                        } else {
                            rowData.push(parts[0]);
                        }
                    }
                });

                // Извлекаем ID лида из строки
                const leadId = row.dataset.id; // Используем data-id, если он есть, для извлечения ID лида

                leadData.push({ id: leadId, data: rowData });
            });
            return leadData;
        }

        // Функция для создания кнопки
        function createFetchButton() {
            const button = document.createElement('button');
            button.textContent = 'Составить календарь предстоящих событий';
            button.className = 'ui-btn crm-robot-btn ui-btn-themes ui-btn-light-border ui-icon-set__scope ui-btn-icon-robots ui-btn-no-caps ui-btn-round --with-left-icon --air ui-btn-sm --style-outline';
            button.style.padding = '10px 20px';
            button.style.marginLeft = '10px'
            //button.style.position = 'absolute';
            /*
            button.style.top = '20px';
            button.style.right = '20px';

            button.style.fontSize = '16px';
            button.style.cursor = 'pointer';
            button.style.zIndex = '9999';*/

            button.onclick = function() {
                if (isRequestInProgress) {
                    console.log('Запрос уже выполняется. Пожалуйста, подождите.');
                    return;
                }

                isRequestInProgress = true;

                // Показываем спиннер
                const spinner = showSpinner();

                GM_xmlhttpRequest({
                    method: 'GET',
                    url: window.location.href,
                    onload: function(response) {
                        processResponseData(response.responseText);
                        isRequestInProgress = false;
                        hideSpinner(spinner);
                    },
                    onerror: function(error) {
                        console.error('Ошибка запроса:', error);
                        isRequestInProgress = false;
                        hideSpinner(spinner);
                    }
                });
            };
            // Исправляем строку поиска элемента
            const uitoolbarfilterbox = document.querySelector('.ui-toolbar-filter-box');//document.getElementById('uiToolbarContainer');

            if (uitoolbarfilterbox) {
                uitoolbarfilterbox.appendChild(button);
            } else {
                console.log('Элемент .ui-toolbar-filter-box не найден.');
            }
            //document.body.appendChild(button);
        }

        // Функция для обработки данных и создания календаря
        function processResponseData(textResponse) {
            const tempDiv = document.createElement('div');
            tempDiv.style.display = 'none';
            document.body.appendChild(tempDiv);
            tempDiv.innerHTML = textResponse;

            const gridWrapper = tempDiv.querySelector('.main-grid-wrapper');

            if (gridWrapper) {
                const data = extractLeadData(gridWrapper);
                console.log(data);
                // Преобразуем данные в формат, который понимает FullCalendar
                const events = data.map(row => {
                    const leadId = row.id;
                    const rowData = row.data;
                    const lidInfo = rowData[3]
                    if (Array.isArray(rowData[6])) {
                        const date = rowData[6][0];
                        const task = rowData[6][1];

                        // Проверяем, является ли дата строкой "без срока"
                        if (date.toLowerCase() === 'без срока' || !date) {
                            //console.warn('Задача без строки:', task);
                            return null; // Пропускаем такие задачи
                        }

                        // Обработка даты с временем, если оно есть
                        const dateTimeFormat = 'DD.MM.YYYY HH:mm'; // Формат с временем
                        let formattedDate = moment(date, dateTimeFormat, true); // строгий режим

                        // Если дата с временем невалидна, пытаемся обработать только дату
                        if (!formattedDate.isValid()) {
                            console.warn('Некорректная дата с временем:', date);
                            const dateOnlyFormat = 'DD.MM.YYYY';
                            formattedDate = moment(date, dateOnlyFormat, true);

                            if (!formattedDate.isValid()) {
                                console.warn('Некорректная дата:', date);
                                return null; // Пропускаем некорректные даты
                            }
                        }

                        return {
                            title: `${lidInfo} \n ${task}`,
                            start: formattedDate.format(), // Форматируем дату в ISO
                            allDay: !date.includes(' '), // Если время есть, событие не всецело на день
                            url: `https://bitrix.triline.kz/crm/lead/details/${leadId}/` // Ссылка на лид
                        };
                    }
                }).filter(event => event); // Фильтруем невалидные события

                // Создание календаря в модальном окне
                const calendarContainer = document.createElement('div');
                $(calendarContainer).fullCalendar({
                    events: events,
                    header: {
                        left: 'prev,next today',
                        center: 'title',
                        right: 'month,agendaWeek,agendaDay'
                    },
                    locale: 'ru', // Подключаем русский язык
                    /*eventClick: function(event) {
                        debug;
                        // Открытие ссылки в новом окне при клике на событие
                        window.open(event.url, '_blank');
                        event.preventDefault();

                    }*/
                });

                createModal(calendarContainer);
            } else {
                console.error("Не удалось найти таблицу на странице.");
            }

            document.body.removeChild(tempDiv);
        }

        createFetchButton(); // Создание кнопки для открытия календаря
    }
})();
