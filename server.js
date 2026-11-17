// Сервер приложения.
// Отдает браузеру страницы, создает задачи, проверяет ответы пользователей
// и сохраняет новые темы и задачи из конструктора (constructor.html).
// Задачи создаются здесь, на сервере: браузер получает только номер задачи,
// название темы, текст условия и единицу измерения. Правильный ответ, формулы
// и случайные параметры остаются на сервере, поэтому подсмотреть ответ в браузере нельзя.
//
// Запуск: node server.js, затем открыть в браузере http://localhost:8000
//
// Этот файл выполняет программа Node.js, а не браузер: здесь нет страницы (document),
// зато можно читать и записывать файлы. Браузер и сервер общаются по протоколу HTTP:
// браузер отправляет запрос — метод (GET или POST) и адрес, например GET /api/topics,
// а сервер присылает ответ — код состояния (200 — все хорошо, 404 — не найдено) и содержимое

// Подключаем встроенные модули Node.js. Приставка node: означает, что модуль
// входит в сам Node.js и устанавливать ничего не нужно
// require('имя') подключает модуль и возвращает его содержимое — объект с функциями.
// const — имя, которому нельзя присвоить другое значение (let — можно); содержимое списка
// или словаря при этом менять можно (push, set)
const http = require('node:http');      // Веб-сервер
const fs = require('node:fs');          // Чтение и запись файлов
const path = require('node:path');      // Пути к файлам
const crypto = require('node:crypto');  // Случайные номера задач

// Берем из генератора задач (generator.js) нужные функции
// const { ... } = require(...) — «деструктуризация»: из объекта, который отдает generator.js
// (его module.exports), берем функции с этими именами, и каждая попадает в свою постоянную.
// shuffle нужен для pickTemplates, generateTask — для generateUniqueTask, cleanNumber — для
// isAnswerCorrect, остальные — для проверки ответа в handleCheck
const {
    shuffle, cleanNumber, evaluate, formatNumber,
    computeValues, getPrecision, computeAnswer, generateTask
} = require('./generator.js');

// Из проверки шаблонов (validator.js) — функции для конструктора
// Так же берем три функции: checkTopic проверяет новую тему, checkTemplate — шаблон задачи,
// tryTemplate пробно создает по шаблону задачи (см. handleCreateTopic, handlePreview, handleSaveTemplate)
const { checkTopic, checkTemplate, tryTemplate } = require('./validator.js');

// Порт — номер «входа» в компьютер для сетевых запросов: у каждой программы-сервера свой порт.
// localhost — «этот же компьютер»: сервер и браузер работают на одной машине
const PORT = 8000; // Номер порта: страница будет открываться по адресу http://localhost:8000

// Папка с файлами тем. __dirname — папка, в которой лежит server.js
// path.join склеивает части пути через нужный разделитель («/» на macOS, «\» на Windows):
// "/Users/…/tasks-physics" и "tasks" → "/Users/…/tasks-physics/tasks"
const TASKS_DIR = path.join(__dirname, 'tasks');

// Файлы, которые сервер отдает браузеру. Отдаются только они: так никто не скачает
// файлы задач (tasks/*.json) с формулами ответов, generator.js, validator.js или сам server.js
// Ключ — адрес, который запрашивает браузер (часть ссылки после http://localhost:8000),
// значение — объект { file, type }: file — путь к файлу в папке проекта, type — тип содержимого.
// Тип сервер отправит в заголовке Content-Type: по нему браузер понимает, что пришло —
// страница HTML, программа JavaScript, оформление CSS или картинка PNG
const STATIC_FILES = {
    // Страницы и их программы: index.html и main.js — тест для ученика, constructor.html и constructor.js —
    // конструктор для учителя; api.js и styles.css подключают обе страницы. Адрес "/" — главная страница
    // (http://localhost:8000/), "/index.html" открывает ее же. charset=utf-8 — кодировка текста:
    // без нее браузер мог бы показать русские буквы непонятными значками
    '/': { file: 'index.html', type: 'text/html; charset=utf-8' },
    '/index.html': { file: 'index.html', type: 'text/html; charset=utf-8' },
    '/main.js': { file: 'main.js', type: 'text/javascript; charset=utf-8' },
    '/api.js': { file: 'api.js', type: 'text/javascript; charset=utf-8' },
    '/constructor.html': { file: 'constructor.html', type: 'text/html; charset=utf-8' },
    '/constructor.js': { file: 'constructor.js', type: 'text/javascript; charset=utf-8' },
    '/styles.css': { file: 'styles.css', type: 'text/css; charset=utf-8' },

    // Картинки с пони для итогов теста: showResults в main.js показывает одну из шести по проценту
    // правильных ответов — чем больше процент, тем больше номер картинки (от result-0.png до result-5.png).
    // Картинка — не текст, поэтому кодировку charset для нее не указывают
    '/images/result-0.png': { file: 'images/result-0.png', type: 'image/png' },
    '/images/result-1.png': { file: 'images/result-1.png', type: 'image/png' },
    '/images/result-2.png': { file: 'images/result-2.png', type: 'image/png' },
    '/images/result-3.png': { file: 'images/result-3.png', type: 'image/png' },
    '/images/result-4.png': { file: 'images/result-4.png', type: 'image/png' },
    '/images/result-5.png': { file: 'images/result-5.png', type: 'image/png' }
};

// Выданные задачи: номер задачи → { topicId, taskId, params }.
// По этим трем значениям сервер заново вычисляет правильный ответ при проверке.
// Map — это «словарь»: по ключу (номеру задачи) быстро находится значение.
// Задачи хранятся в памяти сервера и пропадают после его перезапуска —
// для учебного проекта этого достаточно (настоящее приложение хранило бы их в базе данных)
// Пример записи: "b5f1…" → { topicId: "7_mechanics", taskId: 3, params: { v: 110, t: 2 } }.
// new Map() создает пустой словарь: set добавляет запись, get находит ее по ключу, delete удаляет
const issuedTasks = new Map();

// Отправляет браузеру ответ в формате JSON с кодом состояния:
// 200 — все хорошо, 400 — неверный запрос, 404 — не найдено, 500 — ошибка на сервере
// response — объект ответа: через него сервер пишет ответ браузеру.
// status — код состояния (число), data — объект, который нужно отправить
function sendJSON(response, status, data) {
    // writeHead записывает «шапку» ответа: код состояния и заголовки. Заголовок Content-Type
    // сообщает браузеру, что в ответе текст JSON (его прочитает response.json() в api.js)
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    // JSON.stringify превращает объект в текст JSON: { tasks: [...] } → '{"tasks":[...]}'.
    // end отправляет этот текст и завершает ответ: без end браузер так и ждал бы продолжения
    response.end(JSON.stringify(data));
}

// Отправляет браузеру файл из списка STATIC_FILES.
// Cache-Control: no-cache просит браузер каждый раз проверять, не изменился ли файл,
// чтобы после правок main.js страница не работала со старой копией
// staticFile — запись из STATIC_FILES, например { file: 'main.js', type: 'text/javascript; charset=utf-8' }
function sendFile(response, staticFile) {
    // __dirname — папка, в которой лежит server.js. Так файлы найдутся,
    // из какой бы папки ни запустили сервер.
    // Файлы маленькие, поэтому читаем их синхронно (readFileSync) — так проще
    // Кодировку не указываем, и readFileSync возвращает «сырые» байты (Buffer): так можно отдать
    // и текст, и картинку. Если файла нет, readFileSync бросит ошибку — handleRequest ответит кодом 500
    const content = fs.readFileSync(path.join(__dirname, staticFile.file));
    // Код 200 — «все хорошо». Тип содержимого — из STATIC_FILES, Cache-Control — см. комментарий над функцией
    response.writeHead(200, { 'Content-Type': staticFile.type, 'Cache-Control': 'no-cache' });
    response.end(content); // Отправляем содержимое файла и завершаем ответ
}

// Читает тело запроса — JSON, который прислал браузер, — и превращает его в объект.
// Если прислан не объект JSON, возвращает null.
// Тело приходит по частям, поэтому собираем его в цикле for await:
// await ждет следующую часть, не останавливая работу сервера
// async — асинхронная функция: внутри нее можно ждать (await). Результат она возвращает не сразу,
// а как «обещание» (Promise), поэтому вызывающий тоже ждет его через await (см. handleTasks)
async function readJSON(request) {
    // Принимаем только запросы с заголовком Content-Type: application/json — его ставит
    // sendRequest из api.js. Страница с чужого сайта, открытая в том же браузере,
    // может незаметно отправить на localhost только «простой» запрос (например, text/plain).
    // Запрос с типом application/json браузер сначала согласует с сервером (запрос OPTIONS),
    // а наш сервер такого согласия не дает. Так чужая страница не добавит задачи через конструктор
    // Node.js хранит заголовки запроса в request.headers, их имена — маленькими буквами.
    // ?? '' — если заголовка нет (undefined), берем пустую строку, чтобы startsWith ниже не дал ошибку
    const type = request.headers['content-type'] ?? '';
    // startsWith проверяет начало строки: подойдет и "application/json; charset=utf-8".
    // ! — «не»: если тип другой, сразу выходим из функции с результатом null, даже не читая тело.
    // Короткий if без фигурных скобок выполняет одну команду, записанную после условия
    if (!type.startsWith('application/json')) return null;

    // Части тела — текст в кодировке UTF-8. Без этой строки русская буква,
    // попавшая на стык двух частей, могла бы испортиться
    request.setEncoding('utf8');

    let body = ''; // Сюда собираем текст тела. let — переменная: ее значение будет меняться
    // for await...of берет части тела по одной, по мере их прихода: chunk — очередная часть (строка)
    for await (const chunk of request) {
        body += chunk; // += дописывает часть в конец уже собранного текста
        // Запросы приложения — меньше нескольких килобайт. Слишком большое тело дальше
        // не читаем, чтобы оно не заняло память сервера (return обрывает такой запрос)
        // body.length — количество знаков (а не байтов) в собранном тексте
        if (body.length > 100000) return null;
    }

    // JSON.parse бросает ошибку, если текст — не JSON (или тело пустое)
    // try/catch: если в блоке try возникает ошибка, программа не останавливается,
    // а сразу переходит в блок catch
    try {
        const data = JSON.parse(body); // Текст JSON → объект JavaScript
        // Нужен именно объект { ... }: null, число или массив [ ... ] не подходят
        // typeof дает тип значения строкой: 'object', 'number', 'string'… У null тоже 'object'
        // (старая особенность JavaScript), поэтому null исключаем отдельно, а список — через Array.isArray.
        // === — «равно», !== — «не равно» (сравнение строгое: 1 и "1" не равны), && — «и»
        const isObject = typeof data === 'object' && data !== null && !Array.isArray(data);
        return isObject ? data : null; // Тернарный оператор: условие ? если да : если нет
    } catch { // Сюда попадаем, если JSON.parse бросил ошибку; (error) не пишем — сама ошибка не нужна
        return null; // Не JSON — обработчик ответит «неверный запрос» (код 400)
    }
}

// Загружает тему из файла tasks/<topicId>.json. Если такой темы нет, возвращает null.
// Файл читается при каждом запросе, поэтому исправленные и новые темы
// подхватываются без перезапуска сервера
function loadTopic(topicId) {
    // Имя темы — только латинские буквы, цифры и _ (например, "8_Om").
    // Без этой проверки через имя вида "../имя" можно было бы прочитать любой .json-файл вне папки tasks
    // /^\w+$/ — регулярное выражение (шаблон строки): ^ — начало строки, \w — латинская буква,
    // цифра или _, + — один или несколько таких знаков подряд, $ — конец строки. Вместе:
    // вся строка целиком из этих знаков. test возвращает true, если строка подходит под шаблон.
    // Не подходят русские буквы, точка, «/», «-» и пустая строка
    if (!/^\w+$/.test(topicId)) return null;

    // Полный путь к файлу темы: ".../tasks/8_Om.json". Строка в обратных кавычках `...` — шаблонная:
    // вместо ${topicId} в нее подставляется значение переменной
    const file = path.join(TASKS_DIR, `${topicId}.json`);
    if (!fs.existsSync(file)) return null; // existsSync — есть ли такой файл. Нет файла — нет темы

    // Читаем файл как текст (кодировка utf8) и превращаем JSON в объект темы { id, grade, title, tasks }.
    // Ошибку в JSON (JSON.parse бросит ее) перехватит listTopics, а при других запросах — handleRequest
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// Список всех тем для главной страницы и конструктора: [ { id, grade, title, count }, ... ].
// Темы ищутся по файлам папки tasks: имя файла без .json — это номер темы (id).
// Сортировка: по классу, внутри класса — по алфавиту названий
function listTopics() {
    const topics = []; // Сюда собираем темы для ответа

    // readdirSync возвращает имена всех файлов папки
    // for...of перебирает элементы списка по одному: fileName — имя очередного файла, например "8_Om.json"
    for (const fileName of fs.readdirSync(TASKS_DIR)) {
        // Только файлы тем: "8_Om.json" подходит, "notes.txt" и "8_Om.json.tmp" — нет
        // endsWith проверяет конец строки. continue сразу переходит к следующему шагу цикла — к следующему файлу
        if (!fileName.endsWith('.json')) continue;
        // Номер темы — имя файла без ".json". '.json'.length — длина строки ".json", то есть 5;
        // slice(0, -5) берет знаки с начала строки и отбрасывает 5 последних: "8_Om.json" → "8_Om"
        const id = fileName.slice(0, -'.json'.length);

        // Тему, которая не загрузится или загрузится с ошибкой, пропускаем, чтобы из-за нее
        // не пропал весь список. Причину пишем только в консоль сервера.
        // continue переходит к следующему файлу
        // Сначала имя — та же проверка /^\w+$/, что в loadTopic. Без нее loadTopic вернул бы null,
        // и в консоли была бы неверная причина («нет названия, класса или списка задач»)
        if (!/^\w+$/.test(id)) {
            // console.error пишет в консоль сервера — терминал, где запущен node server.js; браузер этого не видит
            console.error(`Тема ${fileName} пропущена: в имени файла можно использовать только латинские буквы, цифры и _`);
            continue;
        }

        // Переменную объявляем до try: объявленная внутри фигурных скобок, она была бы видна только в них
        let topic;
        try { // Ошибку при загрузке перехватит catch
            topic = loadTopic(id); // Объект темы или null, если файла нет
        } catch (error) { // error — пойманная ошибка, error.message — ее текст
            // Например, после неудачной ручной правки в файле ошибка JSON
            console.error(`Тема ${fileName} пропущена: ${error.message}`);
            continue;
        }

        // Проверяем, что в файле действительно тема: название — строка, класс — целое число
        // (Number.isInteger), задачи — список (Array.isArray). Нужны все условия сразу (&& — «и»)
        const isTopic = topic !== null && typeof topic.title === 'string'
            && Number.isInteger(topic.grade) && Array.isArray(topic.tasks);
        if (!isTopic) { // Не тема — пишем причину в консоль и пропускаем файл
            console.error(`Тема ${fileName} пропущена: в файле нет названия, класса или списка задач`);
            continue;
        }

        // Только номер, класс, название и количество задач: шаблоны с формулами в браузер не уходят
        // push добавляет элемент в конец списка. Запись id: id — поле id со значением переменной id
        topics.push({ id: id, grade: topic.grade, title: topic.title, count: topic.tasks.length });
    }

    // sort сравнивает темы попарно: отрицательное число — первая тема идет раньше.
    // Если классы одинаковые (разность 0), сравниваем названия по русскому алфавиту
    // (a, b) => ... — стрелочная функция: короткая запись функции с параметрами a и b.
    // || — «или»: если разность классов не 0, берется она, а если 0 (0 считается «ложью») —
    // результат localeCompare. Например, темы 7 и 8 класса: 7 - 8 = -1, тема 7 класса идет раньше
    topics.sort((a, b) => a.grade - b.grade || a.title.localeCompare(b.title, 'ru'));
    return topics; // Готовый отсортированный список
}

// Записывает тему в JSON-текст так же, как оформлены файлы базы: крупные части
// (тема, список задач, задача, params, derived) — по полю на строке, а описание
// параметра — в одну строку: "v": { "min": 40, "max": 120, "step": 10 }.
// JSON.stringify(topic, null, 4) растянул бы каждое описание на несколько строк,
// и после сохранения одной задачи в git изменился бы весь файл.
// indent — отступ текущей строки; depth — глубина вложенности:
// 0 — тема, 1 — список задач, 2 — задача, 3 — params и derived
// Функция вызывает сама себя для вложенных частей (рекурсия): тема → список задач → задача → params
function formatJSON(value, indent, depth) {
    // Объект { } или список [ ]: у обоих typeof дает 'object' (как и у null — его исключаем)
    const isObjectOrArray = typeof value === 'object' && value !== null;
    // В одну строку (inlineJSON) пишем: то, что глубже params и derived (описание параметра на глубине 4),
    // простые значения (числа, строки) и пустые {} или [] (например, "tasks": [] у новой темы).
    // Object.keys дает список имен полей объекта (у списка — номеров элементов)
    if (depth > 3 || !isObjectOrArray || Object.keys(value).length === 0) {
        return inlineJSON(value, indent);
    }

    const inner = indent + '    '; // Вложенные строки — на 4 пробела правее
    if (Array.isArray(value)) { // Список (массив): каждый элемент — на своей строке
        // map создает новый список: для каждого элемента item — строка с отступом inner и его записью.
        // Для элемента formatJSON вызывается на уровень глубже (depth + 1)
        const items = value.map((item) => inner + formatJSON(item, inner, depth + 1));
        // join склеивает строки списка через запятую и перевод строки (\n — знак новой строки).
        // Получается "[", элементы по одному на строке и "]" с отступом indent
        return `[\n${items.join(',\n')}\n${indent}]`;
    }
    // Объект: каждое поле на своей строке, "имя": значение. Object.entries дает список пар [имя, значение];
    // ([key, item]) => — деструктуризация: пара сразу раскладывается в две переменные.
    // JSON.stringify(key) берет имя в кавычки: v → "v"
    const fields = Object.entries(value).map(([key, item]) => `${inner}${JSON.stringify(key)}: ${formatJSON(item, inner, depth + 1)}`);
    return `{\n${fields.join(',\n')}\n${indent}}`; // Поля через запятую с новой строки внутри { }
}

// Записывает значение в одну строку: { "min": 1, "max": 5 }, [0.5, 1, 2], "текст".
// Исключение — список объектов (варианты choices): каждый объект на своей строке
function inlineJSON(value, indent) {
    if (Array.isArray(value)) { // Список (массив)
        // some — есть ли в списке хотя бы один элемент, для которого условие верно (здесь — объект)
        const hasObjects = value.some((item) => typeof item === 'object' && item !== null);
        if (hasObjects) { // Например, варианты { "name": "меди", "ro": 8.9 }
            const inner = indent + '    '; // Отступ элементов — на 4 пробела правее
            // Каждый объект — на своей строке, а внутри себя — в одну строку
            const items = value.map((item) => inner + inlineJSON(item, inner));
            return `[\n${items.join(',\n')}\n${indent}]`; // Как в formatJSON: по элементу на строке
        }
        // Список чисел или строк — в одну строку через запятую с пробелом: [0.5, 1, 2]
        return `[${value.map((item) => inlineJSON(item, indent)).join(', ')}]`;
    }
    if (typeof value === 'object' && value !== null) { // Объект (но не null)
        // Поля в виде "имя": значение (Object.entries и [key, item] — как в formatJSON)
        const fields = Object.entries(value).map(([key, item]) => `${JSON.stringify(key)}: ${inlineJSON(item, indent)}`);
        // Пустой объект — просто {}, иначе поля через запятую внутри { } с пробелами: { "min": 1, "max": 5 }
        return fields.length === 0 ? '{}' : `{ ${fields.join(', ')} }`;
    }
    // Число или строка: JSON.stringify добавит кавычки и защитит кавычки внутри строки
    return JSON.stringify(value);
}

// Сохраняет тему в файл tasks/<topicId>.json.
// Сначала пишем временный файл, а потом переименовываем его в настоящий:
// если запись оборвется (например, кончится место на диске), старый файл останется целым
function saveTopic(topicId, topic) {
    const file = path.join(TASKS_DIR, `${topicId}.json`); // Путь к файлу темы, как в loadTopic
    // Пишем тему во временный файл tasks/<topicId>.json.tmp. formatJSON оформляет текст (отступ '',
    // глубина 0 — вся тема), '\n' в конце — перевод строки, как в конце файлов базы
    fs.writeFileSync(`${file}.tmp`, formatJSON(topic, '', 0) + '\n');
    fs.renameSync(`${file}.tmp`, file); // Переименование: временный файл заменяет старый файл темы
}

// Превращает ответ пользователя в число: "2,5" → 2.5, "42 000" → 42000, "-12" → -12.
// Если ответ не число (пустая строка, "abc", "110 км/ч"), возвращает null
function parseUserAnswer(answer) {
    // Ответ — строка из поля для ответа или число. Массив, объект, null ответом не считаются
    if (typeof answer !== 'string' && typeof answer !== 'number') return null;

    // Убираем все пробелы (в том числе неразрывные, которыми formatNumber разделяет
    // разряды в "42 000") и заменяем десятичную запятую точкой — так число записывается в JavaScript
    // String(answer) превращает число в строку. /\s/g — регулярное выражение: \s — любой пробельный знак
    // (обычный и неразрывный пробел, табуляция, перевод строки), g — заменить все такие знаки, а не первый.
    // replace(',', '.') со строкой вместо регулярного выражения меняет только первую запятую:
    // "1,2,3" → "1.2,3", и такой ответ числом не станет
    const text = String(answer).replace(/\s/g, '').replace(',', '.');

    // Пустой ответ — это не ноль, хотя Number('') дал бы 0
    if (text === '') return null;

    // Number.isFinite отсеивает NaN («не число») и бесконечность
    const number = Number(text); // Number: "2.5" → 2.5, "abc" → NaN
    return Number.isFinite(number) ? number : null; // Конечное число — ответ, иначе null
}

// Сравнивает ответ пользователя с точным (неокругленным) значением ответа.
// Допуск на округление — половина единицы последнего знака: при precision = 1 это 0,05.
// Например, если точный ответ 4,35, верными считаются и 4,3, и 4,4, а 4,2 — нет.
// Сравниваем в единицах последнего знака, как в computeAnswer: при precision = 1
// 4,4 → 44, 4,35 → 43,5, разница 0,5 — ответ верный. Вычитать сами дроби нельзя:
// 512.1 - 512.05 = 0.05000000000006821, и верный ответ вышел бы за допуск.
// cleanNumber убирает погрешность умножения: 0.145 * 100 = 14.499999999999998
function isAnswerCorrect(userAnswer, exactAnswer, precision) {
    const factor = 10 ** precision; // ** — возведение в степень: при precision = 1 это 10, при 2 — 100
    // Переводим оба ответа в единицы последнего знака (4,4 → 44, 4,35 → 43,5) и вычитаем.
    // Math.abs — модуль числа (без минуса): неважно, ответ ученика больше точного или меньше
    const difference = Math.abs(cleanNumber(userAnswer * factor) - cleanNumber(exactAnswer * factor));
    return difference <= 0.5; // true — ответ верный, false — нет
}

// Выбирает шаблоны для теста: count пар { topic, template } из выбранных тем topics.
// Шаблоны раздаются, как карты: у каждой темы своя колода — ее шаблоны (topic.tasks)
// в случайном порядке. За один ход каждая тема, в колоде которой еще есть шаблоны,
// отдает по одному, а очередь тем на каждом ходу своя, случайная. Поэтому:
//   - задачи делятся между темами поровну, пока в темах есть неиспользованные шаблоны;
//   - шаблон повторяется, только когда розданы все шаблоны всех выбранных тем:
//     тогда колоды тасуются заново и начинается новый круг.
// Например, темы с 2 и 8 шаблонами, 10 задач — все 10 шаблонов по одному разу;
// три темы по 6 шаблонов, 4 задачи — по задаче из каждой темы и еще одна из случайной.
// Тем должна быть хотя бы одна, и в каждой — хотя бы один шаблон: это проверяет
// handleTasks (без тем цикл while никогда бы не закончился)
function pickTemplates(topics, count) {
    const picked = []; // Выбранные пары { topic, template }
    let decks = [];    // Колоды, в которых еще остались шаблоны

    // while повторяет тело цикла, пока условие верно: пока выбрано меньше count шаблонов
    while (picked.length < count) {
        // Колоды кончились (или это самое начало) — новый круг: тасуем шаблоны каждой темы.
        // shuffle возвращает перемешанную копию, поэтому сами шаблоны темы не пропадут
        if (decks.length === 0) {
            for (const topic of topics) { // Для каждой выбранной темы — своя колода
                // Колода — объект: тема и копия ее шаблонов в случайном порядке
                decks.push({ topic: topic, templates: shuffle(topic.tasks) });
            }
        }

        // Один ход: колоды в случайном порядке отдают по шаблону.
        // pop снимает последний шаблон колоды — колода перемешана, поэтому он случайный
        // shuffle(decks) — перемешанная копия списка колод, но колоды в ней — те же объекты, что в decks:
        // pop ниже уменьшает именно колоду из decks
        for (const deck of shuffle(decks)) {
            // break сразу завершает цикл for, даже если не все колоды отдали шаблон
            if (picked.length === count) break; // Задач уже хватает
            // Берем шаблон из колоды и запоминаем вместе с его темой: тема нужна для номера и названия
            picked.push({ topic: deck.topic, template: deck.templates.pop() });
        }

        // Опустевшие колоды до конца круга больше не участвуют.
        // filter оставляет только колоды, в которых еще есть шаблоны
        decks = decks.filter((deck) => deck.templates.length > 0);
    }

    // Перемешиваем готовый набор, чтобы задачи разных тем шли вперемешку, а не по ходам
    return shuffle(picked);
}

// Создает задачу по шаблону так, чтобы ее условие не совпало с условиями,
// уже попавшими в тест (usedTexts — набор Set из текстов условий).
// Когда шаблон в тесте повторяется, числа могут выпасть те же, что в прошлый раз, —
// тогда создаем задачу заново. Попыток не больше 10: у некоторых шаблонов всего
// около 10 разных условий, и в длинном тесте повтор бывает неизбежен
function generateUniqueTask(template, topicId, usedTexts) {
    let task = generateTask(template, topicId); // Первая попытка: задача со случайными числами
    let attempts = 1; // Сколько раз уже создавали задачу
    // Пока такое условие уже есть в тесте (has проверяет, есть ли значение в наборе Set)
    // и попыток меньше 10, создаем задачу заново
    while (usedTexts.has(task.text) && attempts < 10) {
        task = generateTask(template, topicId); // Новые случайные числа
        attempts++; // ++ увеличивает число на 1
    }
    return task; // Новое условие или, если 10 раз не повезло, повтор
}

// POST /api/tasks — создать задачи по выбранным темам.
// Браузер присылает { "topicIds": ["7_mechanics", "8_Om"], "count": 5 },
// сервер отвечает { "tasks": [ { "id": "...", "topicTitle": "...", "text": "...", "unit": "км/ч" }, ... ] }
async function handleTasks(request, response) {
    // await ждет, пока readJSON прочитает тело запроса, и дает его результат: объект или null.
    // request — запрос браузера, response — ответ сервера (их передает handleRequest)
    const data = await readJSON(request);
    // return завершает функцию: после ответа об ошибке дальше идти не нужно
    if (data === null) { // Тело — не объект JSON
        return sendJSON(response, 400, { error: 'Неверный запрос' }); // Код 400 — «неверный запрос»
    }

    // Номера тем — список строк, например ["7_mechanics", "8_Om"].
    // every проверяет условие для каждого элемента списка
    // Условие записано стрелочной функцией: (id) => typeof id === 'string' — «элемент id — строка»
    const isList = Array.isArray(data.topicIds) && data.topicIds.every((id) => typeof id === 'string');
    if (!isList) { // Не список строк
        return sendJSON(response, 400, { error: 'Неверный запрос' });
    }
    if (data.topicIds.length === 0) { // Пустой список — не отмечено ни одной темы
        return sendJSON(response, 400, { error: 'Выберите хотя бы одну тему' });
    }

    // Браузер тоже проверяет количество задач, но сервер не должен доверять присланным данным
    const count = data.count; // Сколько задач просит браузер, например 5
    // Нужно целое число от 1 до 100, как в readTaskCount из main.js. || — «или»: хватит одного
    // нарушения. Number.isInteger("5") дает false: число, записанное строкой, не подходит
    if (!Number.isInteger(count) || count < 1 || count > 100) {
        return sendJSON(response, 400, { error: 'Количество задач должно быть целым числом от 1 до 100' });
    }

    // Загружаем выбранные темы. new Set убирает повторы:
    // тема, присланная дважды, не должна получить вдвое больше задач.
    // Имя файла темы должно совпасть точно, с учетом больших и маленьких букв (как в handleSaveTemplate):
    // иначе на macOS "8_om" и "8_Om" открыли бы один файл, и тема попала бы в тест дважды
    // Имена всех файлов папки tasks, например ["6_massa.json", "8_Om.json", ...]
    const fileNames = fs.readdirSync(TASKS_DIR);
    const topics = []; // Загруженные темы: { id, title, tasks }
    // new Set(список) — набор без повторов в порядке первого появления; for...of перебирает его.
    // topicId — очередной номер темы, например "8_Om"
    for (const topicId of new Set(data.topicIds)) {
        // includes — есть ли в списке файлов точно такое имя. Если есть — загружаем тему, нет — null
        // (тернарный оператор: условие ? если да : если нет)
        const topic = fileNames.includes(`${topicId}.json`) ? loadTopic(topicId) : null;
        if (topic === null) { // Такой темы нет
            return sendJSON(response, 404, { error: `Тема "${topicId}" не найдена` }); // Код 404 — «не найдено»
        }

        // В теме, только что созданной в конструкторе, задач еще нет
        if (topic.tasks.length === 0) {
            return sendJSON(response, 404, { error: `В теме "${topic.title}" пока нет задач` });
        }

        // Номер темы берем из запроса — это имя ее файла, как в списке тем:
        // по нему handleCheck найдет шаблон, когда будет проверять ответ
        topics.push({ id: topicId, title: topic.title, tasks: topic.tasks });
    }

    // Задачи создаем, только когда все темы загружены: если какой-то темы нет,
    // сервер ответил ошибкой выше и не выдал ни одной задачи
    const tasks = []; // Задачи для ответа браузеру
    const usedTexts = new Set(); // Условия задач, уже попавших в тест
    // pickTemplates (выше) выбирает count пар { topic, template }; pick — очередная пара
    for (const pick of pickTemplates(topics, count)) {
        // Создаем задачу со случайными числами по выбранному шаблону
        const task = generateUniqueTask(pick.template, pick.topic.id, usedTexts);
        usedTexts.add(task.text); // Запоминаем условие: следующие задачи не должны его повторить

        // Запоминаем задачу под случайным номером, который нельзя угадать
        const id = crypto.randomUUID(); // Случайный UUID вида "57fcb39c-ceee-444a-88c3-ef54b8bd7221"
        // set кладет в словарь issuedTasks запись «номер → данные для проверки» (см. handleCheck)
        issuedTasks.set(id, { topicId: task.topicId, taskId: task.taskId, params: task.params });

        // В браузер уходят только номер, название темы, текст условия и единица измерения.
        // Ни ответ (answer), ни случайные параметры (params) отправлять нельзя:
        // в «обратных» задачах ответ — это один из параметров (например, скорость v).
        // Название темы — у каждой задачи: в одном тесте бывают задачи из разных тем
        tasks.push({ id: id, topicTitle: pick.topic.title, text: task.text, unit: task.unit });
    }

    // Все задачи готовы: код 200 и список задач — их покажет на странице showTasks в main.js
    sendJSON(response, 200, { tasks: tasks });
}

// POST /api/check — проверить ответ пользователя.
// Браузер присылает { "id": "...", "answer": "2,5" },
// сервер отвечает { "correct": true, "correctAnswer": "2,5" }
async function handleCheck(request, response) {
    // Тело запроса, например { id: "b5f1…", answer: "2,5" }. Его отправляет checkAnswers в main.js
    const data = await readJSON(request);
    if (data === null) { // Как в handleTasks: не объект JSON
        return sendJSON(response, 400, { error: 'Неверный запрос' });
    }

    // Ищем выданную задачу по ее номеру
    // get возвращает значение по ключу или undefined, если такого ключа в словаре нет
    const task = issuedTasks.get(data.id);
    if (task === undefined) { // Такого номера нет
        // Код 404: checkAnswers в main.js передаст ошибку в finishTest,
        // и страница напишет «Тест прерван» и этот текст
        return sendJSON(response, 404, { error: 'Задача не найдена: ответ уже был проверен или сервер перезапущен' });
    }

    // Ответ, который не удалось прочитать как число, не проверяем и попытку не засчитываем:
    // возможно, пользователь просто дописал единицу измерения ("110 км/ч")
    // parseUserAnswer (выше) вернет число или null
    const userAnswer = parseUserAnswer(data.answer);
    if (userAnswer === null) { // Не число
        // По коду 400 checkAnswers в main.js покажет этот текст под полем для ответа
        return sendJSON(response, 400, { error: 'Введите ответ числом, например 2,5' });
    }

    // Заново вычисляем правильный ответ по сохраненным topicId, taskId и params.
    // ?. означает: если темы нет (null), дальше не идем и получаем undefined.
    // Тема или шаблон могут пропасть, если файл темы изменили после выдачи задачи
    const topic = loadTopic(task.topicId);
    // find ищет в списке шаблонов первый, у которого id равен сохраненному taskId; не нашел — undefined
    const template = topic?.tasks.find((item) => item.id === task.taskId);
    if (template === undefined) { // Нет темы или шаблона
        return sendJSON(response, 404, { error: 'Шаблон задачи не найден' });
    }

    // Все величины задачи: сохраненные случайные параметры и вычисляемые (derived), как при создании задачи
    const values = computeValues(template, task.params);
    // evaluate считает формулу ответа template.answer (например, "v") по этим величинам
    const exactAnswer = evaluate(template.answer, values); // Точное значение, без округления

    // Ответ вычислен — теперь задачу можно удалить: на каждую задачу одна попытка.
    // Поэтому правильный ответ можно сообщить — ответить на эту задачу еще раз не получится.
    // (Если бы вычисление выше дало ошибку, задача осталась бы и попытка не пропала)
    issuedTasks.delete(data.id); // delete удаляет запись из словаря

    // Отвечаем: верен ли ответ (true или false) и каким был правильный ответ
    sendJSON(response, 200, {
        // getPrecision — сколько знаков после запятой в ответе (по умолчанию 2), см. isAnswerCorrect выше
        correct: isAnswerCorrect(userAnswer, exactAnswer, getPrecision(template)),
        // Правильный ответ, округленный и записанный так же, как числа в условии: "2,5", "42 000"
        correctAnswer: formatNumber(computeAnswer(template, values))
    });
}

// GET /api/topics — список тем.
// Сервер отвечает { "topics": [ { "id": "8_Om", "grade": 8, "title": "...", "count": 8 }, ... ] }
// Тело запроса не нужно, поэтому функция получает только response и ничего не ждет (не async)
function handleTopicList(response) {
    sendJSON(response, 200, { topics: listTopics() }); // listTopics читает папку tasks при каждом запросе
}

// POST /api/topics — создать тему (конструктор).
// Браузер присылает { "id": "7_pressure", "grade": 7, "title": "Давление" },
// сервер создает файл tasks/7_pressure.json без задач и отвечает { id, grade, title, count: 0 }
async function handleCreateTopic(request, response) {
    // Тело запроса — тема из формы «Новая тема» конструктора (createTopic в constructor.js)
    const data = await readJSON(request);
    if (data === null) { // Как в handleTasks: не объект JSON
        return sendJSON(response, 400, { error: 'Неверный запрос' });
    }

    // checkTopic при ошибке в данных бросает ошибку со status = 400 — ее перехватит handleRequest
    // Если данные в порядке, checkTopic возвращает тему без задач: { id, grade, title, tasks: [] }
    const topic = checkTopic(data);

    // macOS и Windows не различают большие и маленькие буквы в именах файлов:
    // для них 8_om.json и 8_Om.json — один и тот же файл. Поэтому имена
    // сравниваем, переведя в маленькие буквы (toLowerCase)
    // Например, "7_Pressure" → "7_pressure.json"
    const fileName = `${topic.id}.json`.toLowerCase();
    // some — есть ли в папке tasks хоть один файл с таким же именем без учета больших и маленьких букв
    const exists = fs.readdirSync(TASKS_DIR).some((name) => name.toLowerCase() === fileName);
    if (exists) { // Существующую тему не перезаписываем
        return sendJSON(response, 400, { error: `Тема с именем файла "${topic.id}" уже есть` });
    }

    saveTopic(topic.id, topic); // Файл tasks/<id>.json с пустым списком задач
    // Ответ — как запись в списке тем (listTopics): createTopic покажет учителю, какой файл создан
    sendJSON(response, 200, { id: topic.id, grade: topic.grade, title: topic.title, count: 0 });
}

// POST /api/preview — предпросмотр шаблона задачи (конструктор).
// Браузер присылает { "task": { "text": "...", "params": { ... }, ... } }, сервер проверяет
// шаблон, пробно создает по нему задачи и отвечает
// { "template": { ... }, "examples": [ { "text": "...", "answer": "2,5" }, ... ], "warnings": [ ... ] }.
// Ответы здесь показывать можно: шаблон прислал сам учитель, шаблоны базы сюда не попадают
async function handlePreview(request, response) {
    // Тело запроса — { task: шаблон } из формы конструктора (previewTask в constructor.js)
    const data = await readJSON(request);
    if (data === null) { // Как в handleTasks: не объект JSON
        return sendJSON(response, 400, { error: 'Неверный запрос' });
    }

    // checkTemplate проверяет каждое поле и возвращает «чистую» копию шаблона. При ошибке в данных
    // он бросает ошибку со status = 400, и handleRequest отправит ее текст учителю
    const template = checkTemplate(data.task);
    // tryTemplate пробно создает по шаблону 1000 задач и возвращает { examples, warnings }
    const trial = tryTemplate(template);
    // Шаблон отправляем обратно: showPreview в constructor.js покажет его вместе с примерами задач
    sendJSON(response, 200, { template: template, examples: trial.examples, warnings: trial.warnings });
}

// POST /api/templates — сохранить шаблон задачи в тему (конструктор).
// Браузер присылает { "topicId": "7_pressure", "task": { ... } },
// сервер дописывает шаблон в файл темы и отвечает { "id": 1, "count": 1 } —
// номер нового шаблона и сколько шаблонов стало в теме
async function handleSaveTemplate(request, response) {
    // Тело запроса — { topicId, task } от кнопки «Сохранить задачу» (saveTask в constructor.js)
    const data = await readJSON(request);
    if (data === null) { // Как в handleTasks: не объект JSON
        return sendJSON(response, 400, { error: 'Неверный запрос' });
    }

    // Дальше до конца функции нет ни одного await: Node.js выполнит этот код целиком,
    // не отвлекаясь на другие запросы. Поэтому два одновременных сохранения не перепутаются —
    // второе прочитает файл темы уже вместе с задачей первого

    // Имя файла темы должно совпасть точно, с учетом больших и маленьких букв:
    // иначе на macOS запрос с "8_om" дописал бы задачу в файл 8_Om.json и переименовал бы его
    // Номер темы должен быть строкой, и в папке tasks должен быть файл точно с таким именем (includes)
    const isFound = typeof data.topicId === 'string' && fs.readdirSync(TASKS_DIR).includes(`${data.topicId}.json`);
    const topic = isFound ? loadTopic(data.topicId) : null; // Файл есть — загружаем тему
    if (topic === null) { // Темы нет
        return sendJSON(response, 404, { error: `Тема "${data.topicId}" не найдена` });
    }

    // Браузеру не доверяем: проверяем шаблон заново, даже если предпросмотр прошел
    const template = checkTemplate(data.task);
    // tryTemplate здесь нужен только для проверки: при ошибке он бросит ее (status = 400),
    // и до сохранения дело не дойдет. Примеры и предупреждения не нужны — результат не сохраняем
    tryTemplate(template);

    // Номер нового шаблона — на 1 больше самого большого номера в теме (в пустой теме — 1)
    let maxId = 0; // Самый большой номер, найденный до сих пор
    // Перебираем шаблоны темы
    for (const task of topic.tasks) {
        if (Number.isInteger(task.id) && task.id > maxId) maxId = task.id; // Нашли номер больше — запоминаем его
    }
    const id = maxId + 1; // Например, номера 1–8 → новый шаблон получит 9

    // { id: id, ...template } — новый объект: сначала номер, затем все поля шаблона (... — «разворот»)
    topic.tasks.push({ id: id, ...template });
    saveTopic(data.topicId, topic); // Перезаписываем файл темы — уже с новым шаблоном

    // Отвечаем номером нового шаблона и числом шаблонов в теме — saveTask в constructor.js покажет их учителю
    sendJSON(response, 200, { id: id, count: topic.tasks.length });
}

// Обрабатывает каждый запрос браузера: по методу (GET — получить, POST — отправить данные)
// и адресу решает, что ответить
// Эту функцию Node.js вызывает сам (см. http.createServer в конце файла): request — запрос
// (метод, адрес, заголовки, тело), response — ответ, который мы заполняем и отправляем
async function handleRequest(request, response) {
    // Адрес без параметров после «?»: "/main.js?v=2" → "/main.js"
    // split('?') режет строку по знаку «?» на части: ["/main.js", "v=2"]; [0] — первая часть
    const url = request.url.split('?')[0];

    // try/catch перехватывает неожиданные ошибки (например, опечатку в формуле шаблона),
    // чтобы сервер не остановился, а ответил браузеру кодом 500
    try {
        // Object.hasOwn — только записи самого списка STATIC_FILES, без встроенных
        // свойств объекта (как в getValue из generator.js)
        // Дальше цепочка if / else if выбирает обработчик по методу и адресу (выполняется первый подходящий).
        // Сначала — файлы из STATIC_FILES: страницы, программы, оформление и картинки
        if (request.method === 'GET' && Object.hasOwn(STATIC_FILES, url)) {
            sendFile(response, STATIC_FILES[url]); // STATIC_FILES[url] — запись для этого адреса
        } else if (request.method === 'POST' && url === '/api/tasks') {     // Тест: кнопка «Начать тест»
            // await: ждем, пока обработчик закончит, — тогда его ошибка попадет в catch ниже
            await handleTasks(request, response);
        } else if (request.method === 'POST' && url === '/api/check') {     // Тест: кнопка «Завершить тест»
            await handleCheck(request, response);
        } else if (request.method === 'GET' && url === '/api/topics') {     // Тест и конструктор: список тем
            handleTopicList(response); // Без await: эта функция обычная, не async
        } else if (request.method === 'POST' && url === '/api/topics') {    // Конструктор: кнопка «Создать тему»
            await handleCreateTopic(request, response);
        } else if (request.method === 'POST' && url === '/api/preview') {   // Конструктор: кнопка «Предпросмотр»
            await handlePreview(request, response);
        } else if (request.method === 'POST' && url === '/api/templates') { // Конструктор: кнопка «Сохранить задачу»
            await handleSaveTemplate(request, response);
        } else { // Неизвестный адрес или метод, в том числе запрос OPTIONS (см. readJSON)
            sendJSON(response, 404, { error: 'Не найдено' }); // Код 404 — «не найдено»
        }
    } catch (error) { // error — ошибка, брошенная (throw) внутри try
        // Ошибка в данных из конструктора: validator.js отмечает ее status = 400.
        // Ее текст написан для учителя (в нем может быть формула, но ее прислал сам учитель)
        if (error.status === 400) {
            return sendJSON(response, 400, { error: error.message }); // Текст ошибки — учителю в конструктор
        }

        // Остальные ошибки неожиданные. Подробности пишем только в консоль сервера:
        // в тексте ошибки может быть формула ответа
        console.error(error);
        sendJSON(response, 500, { error: 'Ошибка на сервере' }); // Браузеру — только общий текст и код 500
    }
}

// Создаем сервер: для каждого запроса будет вызываться функция handleRequest
// http.createServer создает веб-сервер. handleRequest передаем без скобок — саму функцию,
// а вызывать ее будет сервер
const server = http.createServer(handleRequest);
// listen запускает сервер на порту 8000: теперь он ждет запросов. Функция () => { ... } выполнится,
// когда сервер будет готов. Если порт уже занят, Node.js остановится с ошибкой EADDRINUSE (см. README)
server.listen(PORT, () => {
    console.log(`Сервер запущен: http://localhost:${PORT}`); // console.log пишет в терминал; ${PORT} → 8000
    console.log('Чтобы остановить сервер, нажмите Ctrl+C');
});
