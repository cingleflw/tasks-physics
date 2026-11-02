// Сервер приложения.
// Отдает браузеру страницу, создает задачи и проверяет ответы пользователей.
// Задачи создаются здесь, на сервере: браузер получает только номер задачи, текст
// условия и единицу измерения. Правильный ответ, формулы и случайные параметры
// остаются на сервере, поэтому подсмотреть ответ в браузере нельзя.
//
// Запуск: node server.js, затем открыть в браузере http://localhost:8000

// Подключаем встроенные модули Node.js. Приставка node: означает, что модуль
// входит в сам Node.js и устанавливать ничего не нужно
const http = require('node:http');      // Веб-сервер
const fs = require('node:fs');          // Чтение файлов
const path = require('node:path');      // Пути к файлам
const crypto = require('node:crypto');  // Случайные номера задач

// Берем из генератора задач (generator.js) нужные функции
const {
    pickRandom, cleanNumber, evaluate, formatNumber,
    computeValues, getPrecision, computeAnswer, generateTask
} = require('./generator.js');

const PORT = 8000; // Номер порта: страница будет открываться по адресу http://localhost:8000

// Файлы, которые сервер отдает браузеру. Отдаются только они: так никто не скачает
// файлы задач (tasks/*.json) с формулами ответов, generator.js или сам server.js
const STATIC_FILES = {
    '/': { file: 'index.html', type: 'text/html; charset=utf-8' },
    '/index.html': { file: 'index.html', type: 'text/html; charset=utf-8' },
    '/main.js': { file: 'main.js', type: 'text/javascript; charset=utf-8' }
};

// Выданные задачи: номер задачи → { topicId, taskId, params }.
// По этим трем значениям сервер заново вычисляет правильный ответ при проверке.
// Map — это «словарь»: по ключу (номеру задачи) быстро находится значение.
// Задачи хранятся в памяти сервера и пропадают после его перезапуска —
// для учебного проекта этого достаточно (настоящее приложение хранило бы их в базе данных)
const issuedTasks = new Map();

// Отправляет браузеру ответ в формате JSON с кодом состояния:
// 200 — все хорошо, 400 — неверный запрос, 404 — не найдено, 500 — ошибка на сервере
function sendJSON(response, status, data) {
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(data));
}

// Отправляет браузеру файл из списка STATIC_FILES.
// Cache-Control: no-cache просит браузер каждый раз проверять, не изменился ли файл,
// чтобы после правок main.js страница не работала со старой копией
function sendFile(response, staticFile) {
    // __dirname — папка, в которой лежит server.js. Так файлы найдутся,
    // из какой бы папки ни запустили сервер.
    // Файлы маленькие, поэтому читаем их синхронно (readFileSync) — так проще
    const content = fs.readFileSync(path.join(__dirname, staticFile.file));
    response.writeHead(200, { 'Content-Type': staticFile.type, 'Cache-Control': 'no-cache' });
    response.end(content);
}

// Читает тело запроса — JSON, который прислал браузер, — и превращает его в объект.
// Если прислан не объект JSON, возвращает null.
// Тело приходит по частям, поэтому собираем его в цикле for await:
// await ждет следующую часть, не останавливая работу сервера
async function readJSON(request) {
    // Части тела — текст в кодировке UTF-8. Без этой строки русская буква,
    // попавшая на стык двух частей, могла бы испортиться
    request.setEncoding('utf8');

    let body = '';
    for await (const chunk of request) {
        body += chunk;
    }

    // JSON.parse бросает ошибку, если текст — не JSON (или тело пустое)
    try {
        const data = JSON.parse(body);
        // Нужен именно объект { ... }: null, число или массив [ ... ] не подходят
        const isObject = typeof data === 'object' && data !== null && !Array.isArray(data);
        return isObject ? data : null;
    } catch {
        return null;
    }
}

// Загружает тему из файла tasks/<topicId>.json. Если такой темы нет, возвращает null.
// Файл читается при каждом запросе, поэтому исправленные и новые темы
// подхватываются без перезапуска сервера
function loadTopic(topicId) {
    // Имя темы — только латинские буквы, цифры и _ (например, "8_Om").
    // Без этой проверки через имя вида "../имя" можно было бы прочитать любой .json-файл вне папки tasks
    if (!/^\w+$/.test(topicId)) return null;

    const file = path.join(__dirname, 'tasks', `${topicId}.json`);
    if (!fs.existsSync(file)) return null;

    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// Превращает ответ пользователя в число: "2,5" → 2.5, "42 000" → 42000, "-12" → -12.
// Если ответ не число (пустая строка, "abc", "110 км/ч"), возвращает null
function parseUserAnswer(answer) {
    // Ответ — строка из окна ввода или число. Массив, объект, null ответом не считаются
    if (typeof answer !== 'string' && typeof answer !== 'number') return null;

    // Убираем все пробелы (в том числе неразрывные, которыми formatNumber разделяет
    // разряды в "42 000") и заменяем десятичную запятую точкой — так число записывается в JavaScript
    const text = String(answer).replace(/\s/g, '').replace(',', '.');

    // Пустой ответ — это не ноль, хотя Number('') дал бы 0
    if (text === '') return null;

    // Number.isFinite отсеивает NaN («не число») и бесконечность
    const number = Number(text);
    return Number.isFinite(number) ? number : null;
}

// Сравнивает ответ пользователя с точным (неокругленным) значением ответа.
// Допуск на округление — половина единицы последнего знака: при precision = 1 это 0,05.
// Например, если точный ответ 4,35, верными считаются и 4,3, и 4,4, а 4,2 — нет.
// Сравниваем в единицах последнего знака, как в computeAnswer: при precision = 1
// 4,4 → 44, 4,35 → 43,5, разница 0,5 — ответ верный. Вычитать сами дроби нельзя:
// 512.1 - 512.05 = 0.05000000000006821, и верный ответ вышел бы за допуск.
// cleanNumber убирает погрешность умножения: 0.145 * 100 = 14.499999999999998
function isAnswerCorrect(userAnswer, exactAnswer, precision) {
    const factor = 10 ** precision;
    const difference = Math.abs(cleanNumber(userAnswer * factor) - cleanNumber(exactAnswer * factor));
    return difference <= 0.5;
}

// POST /api/tasks — создать задачи по теме.
// Браузер присылает { "topicId": "7_mechanics", "count": 5 },
// сервер отвечает { "title": "...", "tasks": [ { "id": "...", "text": "...", "unit": "км/ч" }, ... ] }
async function handleTasks(request, response) {
    const data = await readJSON(request);
    // return завершает функцию: после ответа об ошибке дальше идти не нужно
    if (data === null) {
        return sendJSON(response, 400, { error: 'Неверный запрос' });
    }

    // Номер темы должен быть строкой, например "8_Om"
    if (typeof data.topicId !== 'string') {
        return sendJSON(response, 400, { error: 'Неверный запрос' });
    }

    const topic = loadTopic(data.topicId);
    if (topic === null) {
        return sendJSON(response, 404, { error: `Тема "${data.topicId}" не найдена` });
    }

    // Браузер тоже проверяет количество задач, но сервер не должен доверять присланным данным
    const count = data.count;
    if (!Number.isInteger(count) || count < 1 || count > 100) {
        return sendJSON(response, 400, { error: 'Количество задач должно быть целым числом от 1 до 100' });
    }

    const tasks = [];
    for (let i = 0; i < count; i++) {
        // Выбираем случайный шаблон темы и создаем по нему задачу со случайными числами
        const task = generateTask(pickRandom(topic.tasks), data.topicId);

        // Запоминаем задачу под случайным номером, который нельзя угадать
        const id = crypto.randomUUID();
        issuedTasks.set(id, { topicId: task.topicId, taskId: task.taskId, params: task.params });

        // В браузер уходят только номер, текст условия и единица измерения.
        // Ни ответ (answer), ни случайные параметры (params) отправлять нельзя:
        // в «обратных» задачах ответ — это один из параметров (например, скорость v)
        tasks.push({ id: id, text: task.text, unit: task.unit });
    }

    sendJSON(response, 200, { title: topic.title, tasks: tasks });
}

// POST /api/check — проверить ответ пользователя.
// Браузер присылает { "id": "...", "answer": "2,5" },
// сервер отвечает { "correct": true, "correctAnswer": "2,5" }
async function handleCheck(request, response) {
    const data = await readJSON(request);
    if (data === null) {
        return sendJSON(response, 400, { error: 'Неверный запрос' });
    }

    // Ищем выданную задачу по ее номеру
    const task = issuedTasks.get(data.id);
    if (task === undefined) {
        return sendJSON(response, 404, { error: 'Задача не найдена: ответ уже был проверен или сервер перезапущен' });
    }

    // Ответ, который не удалось прочитать как число, не проверяем и попытку не засчитываем:
    // возможно, пользователь просто дописал единицу измерения ("110 км/ч")
    const userAnswer = parseUserAnswer(data.answer);
    if (userAnswer === null) {
        return sendJSON(response, 400, { error: 'Введите ответ числом, например 2,5' });
    }

    // Заново вычисляем правильный ответ по сохраненным topicId, taskId и params.
    // ?. означает: если темы нет (null), дальше не идем и получаем undefined.
    // Тема или шаблон могут пропасть, если файл темы изменили после выдачи задачи
    const topic = loadTopic(task.topicId);
    const template = topic?.tasks.find((item) => item.id === task.taskId);
    if (template === undefined) {
        return sendJSON(response, 404, { error: 'Шаблон задачи не найден' });
    }

    const values = computeValues(template, task.params);
    const exactAnswer = evaluate(template.answer, values); // Точное значение, без округления

    // Ответ вычислен — теперь задачу можно удалить: на каждую задачу одна попытка.
    // Поэтому правильный ответ можно сообщить — ответить на эту задачу еще раз не получится.
    // (Если бы вычисление выше дало ошибку, задача осталась бы и попытка не пропала)
    issuedTasks.delete(data.id);

    sendJSON(response, 200, {
        correct: isAnswerCorrect(userAnswer, exactAnswer, getPrecision(template)),
        // Правильный ответ, округленный и записанный так же, как числа в условии: "2,5", "42 000"
        correctAnswer: formatNumber(computeAnswer(template, values))
    });
}

// Обрабатывает каждый запрос браузера: по методу (GET — получить, POST — отправить данные)
// и адресу решает, что ответить
async function handleRequest(request, response) {
    // Адрес без параметров после «?»: "/main.js?v=2" → "/main.js"
    const url = request.url.split('?')[0];

    // try/catch перехватывает неожиданные ошибки (например, опечатку в формуле шаблона),
    // чтобы сервер не остановился, а ответил браузеру кодом 500
    try {
        // Object.hasOwn — только записи самого списка STATIC_FILES, без встроенных
        // свойств объекта (как в getValue из generator.js)
        if (request.method === 'GET' && Object.hasOwn(STATIC_FILES, url)) {
            sendFile(response, STATIC_FILES[url]);
        } else if (request.method === 'POST' && url === '/api/tasks') {
            await handleTasks(request, response);
        } else if (request.method === 'POST' && url === '/api/check') {
            await handleCheck(request, response);
        } else {
            sendJSON(response, 404, { error: 'Не найдено' });
        }
    } catch (error) {
        // Подробности пишем только в консоль сервера: в тексте ошибки может быть формула ответа
        console.error(error);
        sendJSON(response, 500, { error: 'Ошибка на сервере' });
    }
}

// Создаем сервер: для каждого запроса будет вызываться функция handleRequest
const server = http.createServer(handleRequest);
server.listen(PORT, () => {
    console.log(`Сервер запущен: http://localhost:${PORT}`);
    console.log('Чтобы остановить сервер, нажмите Ctrl+C');
});
