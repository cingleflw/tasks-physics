// Функция sendRequest (запрос к серверу) — из файла api.js: он подключается раньше этого файла

document.addEventListener('DOMContentLoaded', () => {
    // Список тем загружается с сервера: так на странице появляются
    // и темы, добавленные через конструктор
    showTopics();
});

// Загружает с сервера список тем и показывает кнопки тем, разбитые по классам
async function showTopics() {
    // Блок <div id="topics"> из index.html, в который добавляются кнопки
    const container = document.getElementById('topics');

    try {
        // Сервер присылает { topics: [ { id, grade, title, count }, ... ] }.
        // Темы уже отсортированы: по классу, внутри класса — по алфавиту
        const result = await sendRequest('./api/topics');

        container.textContent = ''; // Убираем надпись «Загрузка списка тем…»
        let grade = null;           // Класс, заголовок которого выведен последним

        for (const topic of result.topics) {
            // Тему без задач (только что созданную в конструкторе) ученику не показываем
            if (topic.count === 0) continue;

            // Начался следующий класс — выводим заголовок, например «7 класс»
            if (topic.grade !== grade) {
                const heading = document.createElement('h3');
                heading.textContent = `${topic.grade} класс`;
                container.append(heading);
                grade = topic.grade;
            }

            // Кнопка темы. textContent вставляет название как обычный текст:
            // даже если в нем есть знаки < и >, браузер не примет их за HTML-теги
            const button = document.createElement('button');
            button.textContent = topic.title;

            // Проверка события клика. Функция-обработчик «помнит» переменную topic
            // своего шага цикла, поэтому у каждой кнопки — своя тема
            button.addEventListener('click', () => {
                // Спрашиваем у пользователя, сколько задач он хочет решить
                const count = askTaskCount(topic.title);

                // Если пользователь нажал "Отмена" или ввел неверное число, прерываем выполнение
                if (count === null) return;

                // Если все проверки пройдены, запускаем тест
                startTest(topic.id, count);
            });

            // Каждая кнопка — на своей строке
            container.append(button, document.createElement('br'));
        }
    } catch (error) {
        // Например, нет связи с сервером: показываем текст ошибки вместо списка тем
        console.error(error);
        container.textContent = `Ошибка: ${error.message}`;
    }
}

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
