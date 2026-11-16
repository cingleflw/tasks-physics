// Функция sendRequest (запрос к серверу) — из файла api.js: он подключается раньше этого файла

// Текущий тест: { items: [...], startTime }, а null — теста нет.
// items — задачи теста; для каждой задачи запоминаем:
//   task    — задача от сервера { id, topicTitle, text, unit },
//   input   — поле для ответа на странице,
//   message — абзац под полем: сюда пишутся просьба ввести число и результат проверки,
//   result  — ответ сервера { correct, correctAnswer } или null, пока ответ не проверен.
// startTime — время начала теста (Date.now(): миллисекунды, прошедшие с 1 января 1970 года)
let currentTest = null;

document.addEventListener('DOMContentLoaded', () => {
    // Назначаем кнопкам их действия
    document.getElementById('start-test').addEventListener('click', startSelectedTest);
    document.getElementById('finish-test').addEventListener('click', finishTest);
    document.getElementById('new-test').addEventListener('click', showSetup);

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

    // Пока сервер составляет тест, кнопка выключена: при двойном щелчке
    // сервер составил бы два теста, и второй заменил бы на странице первый.
    // Когда задачи показаны, блок с кнопкой спрятан, пока не нажата кнопка «Новый тест»
    // (см. showTasks и showSetup)
    const button = document.getElementById('start-test');
    button.disabled = true;
    try {
        await startTest(topicIds, count);
    } finally {
        // finally выполняется в любом случае — и после успеха, и после ошибки
        button.disabled = false;
    }
}

// Запускает тест: просит сервер составить задачи по выбранным темам и показывает их на странице.
// Принимает список ID тем и количество задач
async function startTest(topicIds, count) {
    // try/catch перехватывает ошибки: если сервер недоступен или ответил ошибкой,
    // пользователь увидит сообщение, а не «молчащую» кнопку
    try {
        // Сервер присылает задачи без правильных ответов:
        // { tasks: [ { id, topicTitle, text, unit }, ... ] }
        const test = await sendRequest('./api/tasks', { topicIds: topicIds, count: count });
        showTasks(test.tasks);
    } catch (error) {
        console.error(error);
        alert(`Ошибка: ${error.message}`);
    }
}

// ===== Прохождение теста =====

// Создает элемент tag (например, 'p') с текстом text и добавляет его в конец элемента parent.
// textContent вставляет текст как есть: знаки < и > в условии задачи не станут HTML-тегами.
// (Такая же функция есть в constructor.js — у конструктора своя страница)
function addElement(parent, tag, text) {
    const element = document.createElement(tag);
    element.textContent = text;
    parent.append(element);
    return element;
}

// Показывает задачи теста на странице: у каждой задачи — тема, условие и поле для ответа.
// Выбор тем на время теста прячется, и начинается отсчет времени
function showTasks(tasks) {
    const list = document.getElementById('task-list');
    // Убираем задачи, итоги и сообщения прошлого теста
    list.textContent = '';
    document.getElementById('results').textContent = '';
    document.getElementById('test-message').textContent = '';

    const items = [];
    for (const task of tasks) {
        // li — пункт нумерованного списка ol: номер задачи браузер ставит сам.
        // В одном тесте бывают задачи из разных тем, поэтому тема указана у каждой задачи
        const item = addElement(list, 'li', '');
        addElement(item, 'h3', task.topicTitle);
        addElement(item, 'p', task.text);

        // Поле для ответа — обычное текстовое (type = 'text'), а не числовое (type = 'number'):
        // числовое поле не примет ответ с пробелом между разрядами («42 000»), а запятую
        // разные браузеры понимают по-разному. Число из ответа получает сервер (parseUserAnswer).
        // Подсказку для экранной клавиатуры (inputmode = 'decimal') тоже не ставим:
        // на iPhone в такой клавиатуре нет минуса, а ответ бывает отрицательным (заряд -6 нКл)
        const input = document.createElement('input');
        input.type = 'text';

        // label связывает подпись с полем: щелчок по слову «Ответ» ставит курсор в поле
        const label = addElement(item, 'label', 'Ответ: ');
        label.append(input, ` ${task.unit}`);

        // Пустой абзац для сообщения: «Введите ответ числом…» или результат проверки
        const message = addElement(item, 'p', '');

        items.push({ task: task, input: input, message: message, result: null });
    }

    // На время теста прячем выбор тем (hidden) и показываем блок теста.
    // Кнопка «Начать тест» спрятана вместе с выбором тем, поэтому второй тест
    // не начнется поверх первого
    document.getElementById('setup').hidden = true;
    document.getElementById('test').hidden = false;
    document.getElementById('finish-test').hidden = false;
    document.getElementById('new-test').hidden = true;

    // Время отсчитываем с момента, когда задачи появились на странице
    currentTest = { items: items, startTime: Date.now() };
}

// Кнопка «Завершить тест»: отправляет ответы на проверку и показывает итоги
async function finishTest() {
    // Время прохождения — до нажатия кнопки: ожидание ответа сервера в него не входит.
    // Если ответы пришлось исправлять, считается время последнего нажатия
    const time = Date.now() - currentTest.startTime;
    const testMessage = document.getElementById('test-message');
    testMessage.textContent = '';

    // Задачи без ответа: поле пустое или в нем одни пробелы (trim убирает пробелы по краям).
    // filter оставляет только такие задачи, length — их количество
    const emptyCount = currentTest.items.filter((item) => item.input.value.trim() === '').length;

    // confirm — окно с кнопками «ОК» и «Отмена»: возвращает true, если нажата «ОК».
    // «Отмена» — вернуться к тесту, ничего не отправляя на проверку
    if (emptyCount > 0 && !confirm(`Задач без ответа: ${emptyCount}. Задача без ответа считается ошибкой. Завершить тест?`)) {
        return;
    }

    // Пока ответы проверяются, кнопка выключена: двойной щелчок не отправит их дважды.
    // Выключаем до первого await — иначе второй щелчок успел бы сработать
    const button = document.getElementById('finish-test');
    button.disabled = true;

    // Поля для ответов на время проверки тоже выключаем: ответ, исправленный, пока идет
    // проверка, не совпал бы с тем, что проверил сервер
    for (const item of currentTest.items) {
        item.input.disabled = true;
    }

    try {
        const invalidItems = await checkAnswers();

        // Некоторые ответы сервер не принял, потому что это не числа: тест продолжается.
        // Поля непроверенных задач (не числа и пустые) снова включаем — их можно исправить.
        // Проверенные ответы остаются выключенными: на каждую задачу одна попытка
        if (invalidItems.length > 0) {
            for (const item of currentTest.items) {
                if (item.result === null) item.input.disabled = false;
            }
            testMessage.textContent = 'Не все ответы удалось проверить: исправьте ответы с пометкой «Введите ответ числом» и снова нажмите «Завершить тест».';
            // focus ставит курсор в первое такое поле, и браузер прокручивает к нему страницу
            // (выключенное поле фокус не получает, поэтому включаем поля раньше)
            invalidItems[0].input.focus();
            return;
        }

        showResults(time);
    } catch (error) {
        // Задача не найдена (сервер перезапускали), нет связи с сервером или ошибка на сервере —
        // повторное нажатие этого не исправит, поэтому тест прерывается.
        // Результаты уже проверенных задач все равно показываем: сервер эти задачи уже удалил,
        // и узнать результаты еще раз не получится.
        // Начать тест заново можно кнопкой «Новый тест» — ее показывает endTest
        console.error(error);
        showVerdicts('Не проверено');
        testMessage.textContent = `Тест прерван. ${error.message}`;
        endTest();
    } finally {
        // finally выполняется в любом случае — и после проверки, и после ошибки
        button.disabled = false;
    }
}

// Отправляет на проверку ответы, которые еще не проверены, — по очереди, по одному запросу на задачу.
// Возвращает список задач, ответ которых сервер не принял, потому что это не число
async function checkAnswers() {
    const invalidItems = [];

    for (const item of currentTest.items) {
        // Ответ, проверенный при прошлом нажатии, второй раз не отправляем:
        // на каждую задачу одна попытка, и сервер его уже не найдет
        if (item.result !== null) continue;

        // Убираем прошлую просьбу ввести число — ответ могли исправить
        item.message.textContent = '';

        // Задачу без ответа на проверку не отправляем: она будет засчитана как ошибка
        if (item.input.value.trim() === '') continue;

        // await нужен прямо здесь, внутри try: только так ошибка сервера попадет в catch
        try {
            // Сервер отвечает { correct, correctAnswer }. Результат пока только запоминаем:
            // «Верно» и «Неверно» покажет showResults, когда будут проверены все ответы
            item.result = await sendRequest('./api/check', { id: item.task.id, answer: item.input.value });
        } catch (error) {
            // Остальные ошибки (задача не найдена, нет связи с сервером) повтором не исправить:
            // передаем их дальше в finishTest — там тест прервется
            if (error.status !== 400) throw error;

            // Код 400 — ответ не число («110 км/ч»). Попытка не потрачена: пишем под полем
            // «Введите ответ числом, например 2,5», и ответ можно исправить
            item.message.textContent = error.message;
            invalidItems.push(item);
        }
    }

    return invalidItems;
}

// Пишет под каждой задачей результат проверки: «Верно» или «Неверно. Правильный ответ: …».
// Под задачей, ответ на которую не проверялся, пишет uncheckedText:
// «Нет ответа» в итогах или «Не проверено», если тест прерван
function showVerdicts(uncheckedText) {
    for (const item of currentTest.items) {
        if (item.result === null) {
            item.message.textContent = uncheckedText;
        } else if (item.result.correct) {
            item.message.textContent = 'Верно';
        } else {
            item.message.textContent = `Неверно. Правильный ответ: ${item.result.correctAnswer} ${item.task.unit}`;
        }
    }
}

// Показывает итоги теста: у каждой задачи — верно ли она решена,
// а под списком задач — количество правильных ответов, ошибок и затраченное время.
// Принимает время прохождения теста в миллисекундах
function showResults(time) {
    // Итоги показываются, когда проверены все ответы. Значит, непроверенные задачи — это задачи без ответа
    showVerdicts('Нет ответа');

    // filter оставляет задачи, подходящие под условие, length — их количество
    const correctCount = currentTest.items.filter((item) => item.result !== null && item.result.correct).length;
    const emptyCount = currentTest.items.filter((item) => item.result === null).length;

    // Ошибки — все задачи, решенные неправильно, вместе с задачами без ответа
    const total = currentTest.items.length;
    let errors = `Ошибок: ${total - correctCount}`;
    if (emptyCount > 0) {
        errors += ` (из них без ответа: ${emptyCount})`;
    }

    const results = document.getElementById('results');
    results.textContent = '';
    addElement(results, 'h3', 'Итоги');
    addElement(results, 'p', `Правильных ответов: ${correctCount} из ${total}`);
    addElement(results, 'p', errors);
    addElement(results, 'p', `Затраченное время: ${formatTime(time)}`);

    // === НОВЫЙ БЛОК: Расчет процента и вывод картинки с текстом ===
    const percent = Math.round((correctCount / total) * 100);
    
    // Вычисляем индекс от 0 до 5 (всего 6 диапазонов)
    let imageIndex = Math.floor(percent / (100 / 6));
    if (imageIndex > 5) imageIndex = 5;

    // Настройки для каждого из 6 диапазонов.
    const resultLevels = [
        {
            image: 'result-0.png',
            message: 'Ой! Кажется, физика пока дается нелегко. Стоит повторить формулы и попробовать еще раз!'
        },
        {
            image: 'result-1.png',
            message: 'Есть над чем поработать. Вы на верном пути, но стоит быть внимательнее с вычислениями.'
        },
        {
            image: 'result-2.png',
            message: 'Неплохой результат! Вы усвоили половину материала. Осталось подтянуть оставшиеся темы.'
        },
        {
            image: 'result-3.png',
            message: 'Хороший результат! Вы уверенно справляетесь с большинством задач. Продолжайте в том же духе.'
        },
        {
            image: 'result-4.png',
            message: 'Отлично! Вы отлично знаете материал и решаете задачи почти без ошибок.'
        },
        {
            image: 'result-5.png',
            message: 'Превосходно! Максимальная точность. Вы настоящий знаток физики!'
        }
    ];

    const currentLevel = resultLevels[imageIndex];

    // Создаем контейнер для картинки и текста
    const feedbackContainer = document.createElement('div');
    feedbackContainer.className = 'result-feedback';

    // 1. Общий заголовок (он одинаков для всех)
    const title = document.createElement('h3');
    title.textContent = 'Ваш результат:';
    title.className = 'result-feedback-title';
    
    // 2. Картинка
    const img = document.createElement('img');
    img.src = `./images/${currentLevel.image}`;
    img.alt = `Результат: ${percent}%`;
    img.className = 'result-image';

    // 3. Текст для конкретного результата
    const text = document.createElement('p');
    text.textContent = currentLevel.message;
    text.className = 'result-feedback-text';

    // Собираем всё вместе
    feedbackContainer.append(title, img, text);
    
    // Вставляем в блок итогов
    results.append(feedbackContainer);

    endTest();
}

// Заканчивает тест (после итогов или когда тест прерван): вместо кнопки «Завершить тест»
// появляется кнопка «Новый тест». Поля для ответов уже выключены (см. finishTest)
function endTest() {
    document.getElementById('finish-test').hidden = true;
    document.getElementById('new-test').hidden = false;
}

// Кнопка «Новый тест»: прячет задачи прошлого теста и снова показывает выбор тем.
// Отмеченные темы и количество задач остаются, как были
function showSetup() {
    currentTest = null;
    document.getElementById('test').hidden = true;
    document.getElementById('setup').hidden = false;
}

// Записывает время в минутах и секундах: 205000 мс → «3 мин 25 с», 9000 мс → «9 с».
// Сначала округляем до целых секунд, а уже потом делим на минуты и секунды:
// иначе 119,6 с превратились бы в «1 мин 60 с» вместо «2 мин 0 с».
// Единицы — сокращенно («мин», «с»), чтобы не склонять слова по числу
function formatTime(milliseconds) {
    const totalSeconds = Math.round(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60); // Полные минуты
    const seconds = totalSeconds % 60;             // % — остаток от деления: оставшиеся секунды

    if (minutes === 0) return `${seconds} с`;
    return `${minutes} мин ${seconds} с`;
}
