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

    // Нужно целое число от 1 до 100 — столько же разрешает сервер (server.js)
    if (!Number.isInteger(count) || count < 1 || count > 100) {
        alert("Введите целое число от 1 до 100.");
        return null;
    }
    return count;
}

// Подсказка на случай, если связаться с сервером не удалось
const SERVER_HINT = "Нет связи с сервером. Запустите его командой node server.js " +
    "и откройте страницу по адресу http://localhost:8000 (см. раздел «Запуск» в README.md).";

// Отправляет данные на сервер (POST-запрос) и возвращает ответ сервера — объект из JSON.
// Запрос к серверу занимает время, поэтому функция асинхронная (async):
// await ждет ответа, не замораживая страницу.
// Адрес относительный ("./api/tasks"): запрос уходит на тот же сервер, с которого открыта страница
async function sendRequest(url, data) {
    let response;
    let result;

    // Сюда попадают ошибки связи: сервер не запущен, страница открыта двойным кликом
    // (адрес file://) или открыта с другого сервера, который отвечает не в формате JSON
    // (например, встроенный сервер WebStorm)
    try {
        response = await fetch(url, {
            method: 'POST',                                   // POST — отправляем данные на сервер
            headers: { 'Content-Type': 'application/json' },  // Сообщаем, что данные в формате JSON
            body: JSON.stringify(data)                        // Превращаем объект в текст JSON
        });
        result = await response.json();                      // Превращаем текст ответа обратно в объект
    } catch (error) {
        console.error(error);
        throw new Error(SERVER_HINT); // throw передает ошибку дальше — тому, кто вызвал sendRequest
    }

    // response.ok равно false, если сервер ответил ошибкой (например, 404 — задача не найдена).
    // Текст ошибки сервер присылает в поле error, а код ответа запоминаем в error.status:
    // по нему askAnswer отличит «введено не число» (код 400) от остальных ошибок
    if (!response.ok) {
        const error = new Error(result.error ?? SERVER_HINT);
        error.status = response.status;
        throw error;
    }
    return result;
}

// Показывает задачу и спрашивает ответ, пока сервер не примет его на проверку.
// Возвращает результат проверки { correct, correctAnswer } или null, если нажата "Отмена"
async function askAnswer(task, header) {
    // Цикл повторяется, если введено не число
    while (true) {
        const input = prompt(`${header}\n\n${task.text}\n\nВведите ответ числом (${task.unit}):`, "");

        // Пользователь нажал "Отмена"
        if (input === null) return null;

        // await нужен прямо здесь, внутри try: только так ошибка сервера попадет в catch
        try {
            return await sendRequest('./api/check', { id: task.id, answer: input });
        } catch (error) {
            // Остальные ошибки (задача не найдена, нет связи с сервером) повтором не исправить:
            // передаем их дальше в startTest — там появится сообщение, и тест прервется
            if (error.status !== 400) throw error;

            alert(error.message); // «Введите ответ числом, например 2,5» — и спрашиваем снова
        }
    }
}

// Запускает тест: просит сервер создать задачи и по очереди показывает их пользователю.
// Принимает ID темы и количество задач
async function startTest(topicId, count) {
    // try/catch перехватывает ошибки: если сервер недоступен или ответил ошибкой,
    // пользователь увидит сообщение, а не «молчащую» кнопку
    try {
        // Сервер присылает название темы и задачи без правильных ответов:
        // { title: "...", tasks: [ { id, text, unit }, ... ] }
        const topic = await sendRequest('./api/tasks', { topicId: topicId, count: count });

        // Проходимся по задачам: показываем условие, отправляем ответ на проверку, сообщаем результат
        for (let i = 0; i < topic.tasks.length; i++) {
            const task = topic.tasks[i];
            const result = await askAnswer(task, `${topic.title}. Задача ${i + 1} из ${topic.tasks.length}`);

            // Если пользователь нажал "Отмена", прекращаем тест
            if (result === null) return;

            if (result.correct) {
                alert("Верно!");
            } else {
                alert(`Неверно. Правильный ответ: ${result.correctAnswer} ${task.unit}`);
            }
        }
    } catch (error) {
        console.error(error);
        alert(`Ошибка: ${error.message}`);
    }
}
