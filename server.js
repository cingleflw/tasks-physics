// Сервер приложения.
// Отдает браузеру страницы, создает задачи, проверяет ответы пользователей
// и сохраняет новые темы и задачи из конструктора (constructor.html).
// Задачи создаются здесь, на сервере: браузер получает только номер задачи, текст
// условия и единицу измерения. Правильный ответ, формулы и случайные параметры
// остаются на сервере, поэтому подсмотреть ответ в браузере нельзя.
//
// Запуск: node server.js, затем открыть в браузере http://localhost:8000

// Подключаем встроенные модули Node.js. Приставка node: означает, что модуль
// входит в сам Node.js и устанавливать ничего не нужно
const http = require('node:http');      // Веб-сервер
const fs = require('node:fs');          // Чтение и запись файлов
const path = require('node:path');      // Пути к файлам
const crypto = require('node:crypto');  // Случайные номера задач

// Берем из генератора задач (generator.js) нужные функции
const {
    pickRandom, cleanNumber, evaluate, formatNumber,
    computeValues, getPrecision, computeAnswer, generateTask
} = require('./generator.js');

// Из проверки шаблонов (validator.js) — функции для конструктора
const { checkTopic, checkTemplate, tryTemplate } = require('./validator.js');

const PORT = 8000; // Номер порта: страница будет открываться по адресу http://localhost:8000

// Папка с файлами тем. __dirname — папка, в которой лежит server.js
const TASKS_DIR = path.join(__dirname, 'tasks');

// Файлы, которые сервер отдает браузеру. Отдаются только они: так никто не скачает
// файлы задач (tasks/*.json) с формулами ответов, generator.js, validator.js или сам server.js
const STATIC_FILES = {
    '/': { file: 'index.html', type: 'text/html; charset=utf-8' },
    '/index.html': { file: 'index.html', type: 'text/html; charset=utf-8' },
    '/main.js': { file: 'main.js', type: 'text/javascript; charset=utf-8' },
    '/api.js': { file: 'api.js', type: 'text/javascript; charset=utf-8' },
    '/constructor.html': { file: 'constructor.html', type: 'text/html; charset=utf-8' },
    '/constructor.js': { file: 'constructor.js', type: 'text/javascript; charset=utf-8' }
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
    // Принимаем только запросы с заголовком Content-Type: application/json — его ставит
    // sendRequest из api.js. Страница с чужого сайта, открытая в том же браузере,
    // может незаметно отправить на localhost только «простой» запрос (например, text/plain).
    // Запрос с типом application/json браузер сначала согласует с сервером (запрос OPTIONS),
    // а наш сервер такого согласия не дает. Так чужая страница не добавит задачи через конструктор
    const type = request.headers['content-type'] ?? '';
    if (!type.startsWith('application/json')) return null;

    // Части тела — текст в кодировке UTF-8. Без этой строки русская буква,
    // попавшая на стык двух частей, могла бы испортиться
    request.setEncoding('utf8');

    let body = '';
    for await (const chunk of request) {
        body += chunk;
        // Запросы приложения — меньше нескольких килобайт. Слишком большое тело дальше
        // не читаем, чтобы оно не заняло память сервера (return обрывает такой запрос)
        if (body.length > 100000) return null;
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

    const file = path.join(TASKS_DIR, `${topicId}.json`);
    if (!fs.existsSync(file)) return null;

    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// Список всех тем для главной страницы и конструктора: [ { id, grade, title, count }, ... ].
// Темы ищутся по файлам папки tasks: имя файла без .json — это номер темы (id).
// Сортировка: по классу, внутри класса — по алфавиту названий
function listTopics() {
    const topics = [];

    // readdirSync возвращает имена всех файлов папки
    for (const fileName of fs.readdirSync(TASKS_DIR)) {
        // Только файлы тем: "8_Om.json" подходит, "notes.txt" и "8_Om.json.tmp" — нет
        if (!fileName.endsWith('.json')) continue;
        const id = fileName.slice(0, -'.json'.length);

        // Тему, которая не загрузится или загрузится с ошибкой, пропускаем, чтобы из-за нее
        // не пропал весь список. Причину пишем только в консоль сервера.
        // continue переходит к следующему файлу
        if (!/^\w+$/.test(id)) {
            console.error(`Тема ${fileName} пропущена: в имени файла можно использовать только латинские буквы, цифры и _`);
            continue;
        }

        let topic;
        try {
            topic = loadTopic(id);
        } catch (error) {
            // Например, после неудачной ручной правки в файле ошибка JSON
            console.error(`Тема ${fileName} пропущена: ${error.message}`);
            continue;
        }

        const isTopic = topic !== null && typeof topic.title === 'string'
            && Number.isInteger(topic.grade) && Array.isArray(topic.tasks);
        if (!isTopic) {
            console.error(`Тема ${fileName} пропущена: в файле нет названия, класса или списка задач`);
            continue;
        }

        // Только номер, класс, название и количество задач: шаблоны с формулами в браузер не уходят
        topics.push({ id: id, grade: topic.grade, title: topic.title, count: topic.tasks.length });
    }

    // sort сравнивает темы попарно: отрицательное число — первая тема идет раньше.
    // Если классы одинаковые (разность 0), сравниваем названия по русскому алфавиту
    topics.sort((a, b) => a.grade - b.grade || a.title.localeCompare(b.title, 'ru'));
    return topics;
}

// Записывает тему в JSON-текст так же, как оформлены файлы базы: крупные части
// (тема, список задач, задача, params, derived) — по полю на строке, а описание
// параметра — в одну строку: "v": { "min": 40, "max": 120, "step": 10 }.
// JSON.stringify(topic, null, 4) растянул бы каждое описание на несколько строк,
// и после сохранения одной задачи в git изменился бы весь файл.
// indent — отступ текущей строки; depth — глубина вложенности:
// 0 — тема, 1 — список задач, 2 — задача, 3 — params и derived
function formatJSON(value, indent, depth) {
    const isObjectOrArray = typeof value === 'object' && value !== null;
    if (depth > 3 || !isObjectOrArray || Object.keys(value).length === 0) {
        return inlineJSON(value, indent);
    }

    const inner = indent + '    '; // Вложенные строки — на 4 пробела правее
    if (Array.isArray(value)) {
        const items = value.map((item) => inner + formatJSON(item, inner, depth + 1));
        return `[\n${items.join(',\n')}\n${indent}]`;
    }
    const fields = Object.entries(value).map(([key, item]) => `${inner}${JSON.stringify(key)}: ${formatJSON(item, inner, depth + 1)}`);
    return `{\n${fields.join(',\n')}\n${indent}}`;
}

// Записывает значение в одну строку: { "min": 1, "max": 5 }, [0.5, 1, 2], "текст".
// Исключение — список объектов (варианты choices): каждый объект на своей строке
function inlineJSON(value, indent) {
    if (Array.isArray(value)) {
        const hasObjects = value.some((item) => typeof item === 'object' && item !== null);
        if (hasObjects) {
            const inner = indent + '    ';
            const items = value.map((item) => inner + inlineJSON(item, inner));
            return `[\n${items.join(',\n')}\n${indent}]`;
        }
        return `[${value.map((item) => inlineJSON(item, indent)).join(', ')}]`;
    }
    if (typeof value === 'object' && value !== null) {
        const fields = Object.entries(value).map(([key, item]) => `${JSON.stringify(key)}: ${inlineJSON(item, indent)}`);
        return fields.length === 0 ? '{}' : `{ ${fields.join(', ')} }`;
    }
    // Число или строка: JSON.stringify добавит кавычки и защитит кавычки внутри строки
    return JSON.stringify(value);
}

// Сохраняет тему в файл tasks/<topicId>.json.
// Сначала пишем временный файл, а потом переименовываем его в настоящий:
// если запись оборвется (например, кончится место на диске), старый файл останется целым
function saveTopic(topicId, topic) {
    const file = path.join(TASKS_DIR, `${topicId}.json`);
    fs.writeFileSync(`${file}.tmp`, formatJSON(topic, '', 0) + '\n');
    fs.renameSync(`${file}.tmp`, file);
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

    // В теме, только что созданной в конструкторе, задач еще нет
    if (topic.tasks.length === 0) {
        return sendJSON(response, 404, { error: `В теме "${topic.title}" пока нет задач` });
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

// GET /api/topics — список тем.
// Сервер отвечает { "topics": [ { "id": "8_Om", "grade": 8, "title": "...", "count": 8 }, ... ] }
function handleTopicList(response) {
    sendJSON(response, 200, { topics: listTopics() });
}

// POST /api/topics — создать тему (конструктор).
// Браузер присылает { "id": "7_pressure", "grade": 7, "title": "Давление" },
// сервер создает файл tasks/7_pressure.json без задач и отвечает { id, grade, title, count: 0 }
async function handleCreateTopic(request, response) {
    const data = await readJSON(request);
    if (data === null) {
        return sendJSON(response, 400, { error: 'Неверный запрос' });
    }

    // checkTopic при ошибке в данных бросает ошибку со status = 400 — ее перехватит handleRequest
    const topic = checkTopic(data);

    // macOS и Windows не различают большие и маленькие буквы в именах файлов:
    // для них 8_om.json и 8_Om.json — один и тот же файл. Поэтому имена
    // сравниваем, переведя в маленькие буквы (toLowerCase)
    const fileName = `${topic.id}.json`.toLowerCase();
    const exists = fs.readdirSync(TASKS_DIR).some((name) => name.toLowerCase() === fileName);
    if (exists) {
        return sendJSON(response, 400, { error: `Тема с именем файла "${topic.id}" уже есть` });
    }

    saveTopic(topic.id, topic);
    sendJSON(response, 200, { id: topic.id, grade: topic.grade, title: topic.title, count: 0 });
}

// POST /api/preview — предпросмотр шаблона задачи (конструктор).
// Браузер присылает { "task": { "text": "...", "params": { ... }, ... } }, сервер проверяет
// шаблон, пробно создает по нему задачи и отвечает
// { "template": { ... }, "examples": [ { "text": "...", "answer": "2,5" }, ... ], "warnings": [ ... ] }.
// Ответы здесь показывать можно: шаблон прислал сам учитель, шаблоны базы сюда не попадают
async function handlePreview(request, response) {
    const data = await readJSON(request);
    if (data === null) {
        return sendJSON(response, 400, { error: 'Неверный запрос' });
    }

    const template = checkTemplate(data.task);
    const trial = tryTemplate(template);
    sendJSON(response, 200, { template: template, examples: trial.examples, warnings: trial.warnings });
}

// POST /api/templates — сохранить шаблон задачи в тему (конструктор).
// Браузер присылает { "topicId": "7_pressure", "task": { ... } },
// сервер дописывает шаблон в файл темы и отвечает { "id": 1, "count": 1 } —
// номер нового шаблона и сколько шаблонов стало в теме
async function handleSaveTemplate(request, response) {
    const data = await readJSON(request);
    if (data === null) {
        return sendJSON(response, 400, { error: 'Неверный запрос' });
    }

    // Дальше до конца функции нет ни одного await: Node.js выполнит этот код целиком,
    // не отвлекаясь на другие запросы. Поэтому два одновременных сохранения не перепутаются —
    // второе прочитает файл темы уже вместе с задачей первого

    // Имя файла темы должно совпасть точно, с учетом больших и маленьких букв:
    // иначе на macOS запрос с "8_om" дописал бы задачу в файл 8_Om.json и переименовал бы его
    const isFound = typeof data.topicId === 'string' && fs.readdirSync(TASKS_DIR).includes(`${data.topicId}.json`);
    const topic = isFound ? loadTopic(data.topicId) : null;
    if (topic === null) {
        return sendJSON(response, 404, { error: `Тема "${data.topicId}" не найдена` });
    }

    // Браузеру не доверяем: проверяем шаблон заново, даже если предпросмотр прошел
    const template = checkTemplate(data.task);
    tryTemplate(template);

    // Номер нового шаблона — на 1 больше самого большого номера в теме (в пустой теме — 1)
    let maxId = 0;
    for (const task of topic.tasks) {
        if (Number.isInteger(task.id) && task.id > maxId) maxId = task.id;
    }
    const id = maxId + 1;

    // { id: id, ...template } — новый объект: сначала номер, затем все поля шаблона (... — «разворот»)
    topic.tasks.push({ id: id, ...template });
    saveTopic(data.topicId, topic);

    sendJSON(response, 200, { id: id, count: topic.tasks.length });
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
        } else if (request.method === 'GET' && url === '/api/topics') {
            handleTopicList(response);
        } else if (request.method === 'POST' && url === '/api/topics') {
            await handleCreateTopic(request, response);
        } else if (request.method === 'POST' && url === '/api/preview') {
            await handlePreview(request, response);
        } else if (request.method === 'POST' && url === '/api/templates') {
            await handleSaveTemplate(request, response);
        } else {
            sendJSON(response, 404, { error: 'Не найдено' });
        }
    } catch (error) {
        // Ошибка в данных из конструктора: validator.js отмечает ее status = 400.
        // Ее текст написан для учителя (в нем может быть формула, но ее прислал сам учитель)
        if (error.status === 400) {
            return sendJSON(response, 400, { error: error.message });
        }

        // Остальные ошибки неожиданные. Подробности пишем только в консоль сервера:
        // в тексте ошибки может быть формула ответа
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
