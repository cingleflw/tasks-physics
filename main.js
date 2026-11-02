document.addEventListener('DOMContentLoaded', () => {

    // Находим все кнопки, у которых есть класс 'topic-btn'
    const buttons = document.querySelectorAll('.topic-btn');

    // Проходимся циклом по каждой найденной кнопке
    buttons.forEach(button => {
        // Проверка события клика
        button.addEventListener('click', (event) => {

            // event.target — это именно та кнопка, по которой кликнули.
            // data-topic берет значение из HTML-атрибута data-topic (например, "7_mechanics")
            const topicId = event.target.dataset.topic;

            // textContent берет текст, написанный внутри кнопки (например, "Механическое движение")
            const topicName = event.target.textContent;

            // Спрашиваем у пользователя, сколько задач он хочет решить
            const count = askTaskCount(topicName);

            // Если пользователь нажал "Отмена" или ввел неверное число, прерываем выполнение
            if (count === null) return;

            // Если все проверки пройдены, запускаем тест
            startTest(topicId, count);
        });
    });
});

// Спрашивает у пользователя, сколько задач он хочет решить.
// Возвращает целое число от 1 до 100 или null, если ввод отменен или неверен
function askTaskCount(topicName) {
    const input = prompt(`Тема: "${topicName}".\nСколько задач решить?`, "");

    // Если пользователь нажал "Отмена" (вернется null) или ничего не ввел
    if (input === null || input === "") return null;

    // Преобразуем введенную строку в число
    const count = Number(input);

    // Нужно целое число от 1 до 100: слишком много задач «повесит» страницу
    if (!Number.isInteger(count) || count < 1 || count > 100) {
        alert("Введите целое число от 1 до 100.");
        return null;
    }
    return count;
}

// Загружает JSON-файл темы из папки tasks (например, tasks/7_mechanics.json).
// Запрос к серверу занимает время, поэтому функция асинхронная (async):
// await ждет ответа, не замораживая страницу.
async function loadTopic(topicId) {
    const response = await fetch(`./tasks/${topicId}.json`);

    // response.ok равно false, если сервер ответил ошибкой (например, 404 — файла нет)
    if (!response.ok) {
        throw new Error(`Не удалось загрузить тему "${topicId}" (код ответа ${response.status})`);
    }

    // Превращаем текст JSON в обычный объект JavaScript
    return response.json();
}

// Функция генерации задач
// Принимает ID темы и количество задач
async function startTest(topicId, count) {
    // try/catch перехватывает ошибки: если файл темы не загрузился или в шаблоне
    // задачи есть ошибка, пользователь увидит сообщение, а не «молчащую» кнопку
    try {
        const topic = await loadTopic(topicId);   // Берем тему с шаблонами задач из JSON-файла
        const generatedTasks = [];                // Создаем пустой массив для сгенерированных задач

        // Цикл: генерируем столько задач, сколько попросил пользователь
        for (let i = 0; i < count; i++) {
            // Выбираем случайный шаблон задачи из темы и создаем по нему задачу со случайными числами
            const template = pickRandom(topic.tasks);
            generatedTasks.push(generateTask(template, topicId));
        }

        printTasks(topic.title, generatedTasks);
    } catch (error) {
        console.error(error);

        let message = `Ошибка: ${error.message}`;
        // Если index.html открыт двойным кликом (адрес начинается с file://), браузер запрещает fetch
        if (location.protocol === 'file:') {
            message += '\n\nОткройте страницу через локальный сервер (см. раздел «Запуск» в README.md).';
        }
        alert(message);
    }
}

// Выводит сгенерированные задачи в консоль браузера (F12 → Console)
function printTasks(topicTitle, tasks) {
    console.log(`Тема "${topicTitle}". Сгенерировано задач: ${tasks.length}`);

    // Проходимся по сгенерированным задачам и выводим их в консоль
    tasks.forEach((task, index) => {
        console.log(`${index + 1}. ${task.text} (Ответ: ${formatNumber(task.answer)} ${task.unit})`);
    });

    // Полные объекты задач: в них видны сохраненные случайные параметры (params)
    console.log(tasks);
}
