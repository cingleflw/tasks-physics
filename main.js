// Функция sendRequest (запрос к серверу) — из файла api.js: он подключается раньше этого файла

document.addEventListener('DOMContentLoaded', () => {
    // Кнопка «Начать тест» запускает тест по отмеченным темам
    document.getElementById('start-test').addEventListener('click', startSelectedTest);

    // Список тем загружается с сервера: так на странице появляются
    // и темы, добавленные через конструктор
    showTopics();
});

// Загружает с сервера список тем и показывает темы с галочками, разбитые по классам
async function showTopics() {
    // Блок <div id="topics"> из index.html, в который добавляются темы
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

            // Галочка темы (checkbox). В value запоминаем номер темы —
            // его прочитает getSelectedTopicIds, когда нажмут «Начать тест»
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = topic.id;

            // label связывает галочку с названием: щелчок по названию тоже ставит галочку.
            // Строку append вставляет как обычный текст (как textContent): даже если
            // в названии есть знаки < и >, браузер не примет их за HTML-теги
            const label = document.createElement('label');
            label.append(checkbox, ` ${topic.title}`);

            // Каждая тема — на своей строке
            container.append(label, document.createElement('br'));
        }

        // Список загружен — теперь можно начинать тест
        document.getElementById('start-test').disabled = false;
    } catch (error) {
        // Например, нет связи с сервером: показываем текст ошибки вместо списка тем.
        // Кнопка «Начать тест» остается выключенной: выбирать не из чего
        console.error(error);
        container.textContent = `Ошибка: ${error.message}`;
    }
}

// Номера отмеченных тем, например ["7_mechanics", "8_Om"]
function getSelectedTopicIds() {
    const ids = [];
    // querySelectorAll находит все отмеченные (:checked) галочки внутри блока topics
    for (const checkbox of document.querySelectorAll('#topics input:checked')) {
        ids.push(checkbox.value);
    }
    return ids;
}

// Читает количество задач из поля «Количество задач».
// Возвращает целое число от 1 до 100 или null, если введено что-то другое.
// Если в поле не число, браузер возвращает пустую строку, а Number('') = 0 — проверку это не пройдет
function readTaskCount() {
    const count = Number(document.getElementById('task-count').value);

    // Нужно целое число от 1 до 100 — столько же разрешает сервер (server.js)
    if (!Number.isInteger(count) || count < 1 || count > 100) return null;
    return count;
}

// Кнопка «Начать тест»: проверяет, что отмечены темы и введено количество задач, и запускает тест
async function startSelectedTest() {
    const topicIds = getSelectedTopicIds();
    if (topicIds.length === 0) {
        alert("Выберите хотя бы одну тему.");
        return;
    }

    const count = readTaskCount();
    if (count === null) {
        alert("Введите количество задач — целое число от 1 до 100.");
        return;
    }

    // Пока идет тест, кнопка выключена: при двойном щелчке второй тест
    // начался бы поверх первого, и окна с задачами перемешались бы
    const button = document.getElementById('start-test');
    button.disabled = true;
    try {
        await startTest(topicIds, count);
    } finally {
        // finally выполняется в любом случае — и после конца теста, и после ошибки
        button.disabled = false;
    }
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

// Запускает тест: просит сервер составить задачи по выбранным темам и по очереди показывает их пользователю.
// Принимает список ID тем и количество задач
async function startTest(topicIds, count) {
    // try/catch перехватывает ошибки: если сервер недоступен или ответил ошибкой,
    // пользователь увидит сообщение, а не «молчащую» кнопку
    try {
        // Сервер присылает задачи без правильных ответов:
        // { tasks: [ { id, topicTitle, text, unit }, ... ] }
        const test = await sendRequest('./api/tasks', { topicIds: topicIds, count: count });

        // Проходимся по задачам: показываем условие, отправляем ответ на проверку, сообщаем результат
        for (let i = 0; i < test.tasks.length; i++) {
            const task = test.tasks[i];

            // В одном тесте могут быть задачи из разных тем, поэтому тема указана у каждой задачи
            const result = await askAnswer(task, `${task.topicTitle}. Задача ${i + 1} из ${test.tasks.length}`);

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
