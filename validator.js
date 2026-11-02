// Проверка тем и шаблонов задач, присланных из конструктора (constructor.html).
// Конструктор отправляет шаблон в том же формате, что и в файлах tasks/*.json
// (см. «Формат задачи» в README.md). Сервер не доверяет присланным данным: прежде чем
// показать предпросмотр или сохранить шаблон в файл, он проверяет каждое поле
// и пробно создает по шаблону много задач.
// Файл подключается только на сервере (server.js) — так же, как generator.js.

// Берем из генератора задач (generator.js) нужные функции
const {
    generateTask, computeValues, evaluate, formatNumber, fillText, computeAnswer
} = require('./generator.js');

// Имя величины или поля варианта: латинская буква, затем латинские буквы, цифры и _
// (v, t1, material, ro). Такие имена понимают формулы и подстановки в тексте
const NAME_PATTERN = /^[A-Za-z]\w*$/;

const TRIAL_COUNT = 1000;       // Сколько пробных задач создать по шаблону
const EXAMPLE_COUNT = 3;        // Сколько из них показать учителю в предпросмотре
const HIDDEN_CHECK_COUNT = 100; // На скольких из них искать скрытый параметр (findHiddenParam):
                                // проверка дольше остальных, а 100 раз хватает с запасом

// Ограничения размера шаблона. По каждому шаблону сервер пробно создает 1000 задач,
// и слишком большой шаблон надолго занял бы сервер: все это время ученики ждали бы
// проверки ответов. Задачам базы хватает с большим запасом (в самой длинной
// 243 знака и 6 подстановок, больше всего — 4 параметра и 9 вариантов)
const MAX_TEXT_LENGTH = 1000;   // Знаков в тексте условия
const MAX_PLACEHOLDERS = 20;    // Подстановок {…} в тексте
const MAX_NAMES = 10;           // Случайных параметров (и отдельно — вычисляемых величин)
const MAX_FORMULA_LENGTH = 200; // Знаков в формуле
const MAX_CHOICES = 50;         // Вариантов у одного параметра
const MAX_FIELD_LENGTH = 100;   // Знаков в текстовом поле варианта ("меди")

// Сообщает об ошибке в присланных данных: создает ошибку и бросает ее (throw).
// throw сразу прерывает проверку, а server.js по status = 400 («неверный запрос»)
// понимает, что текст ошибки написан для учителя и его можно показать
// (так же main.js различает ошибки по error.status)
function fail(message) {
    const error = new Error(message);
    error.status = 400;
    throw error;
}

// Объект вида { ... }: не null (typeof null тоже равно 'object') и не массив
function isObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Проверяет имя величины. what — кто носит это имя, для текста ошибки: "Параметр", "Величина"
function checkName(name, what) {
    if (!NAME_PATTERN.test(name)) {
        fail(`${what} «${name}»: имя должно начинаться с латинской буквы, дальше — латинские буквы, цифры и _`);
    }
}

// Проверяет, что значение — непустая строка, и возвращает ее без пробелов по краям.
// message — текст ошибки, если строки нет
function checkText(value, message) {
    if (typeof value !== 'string' || value.trim() === '') {
        fail(message);
    }
    return value.trim();
}

// Проверяет формулу: в ней могут быть только числа, имена величин, знаки + - * / и скобки.
// generator.js тоже проверяет формулу, но уже после подстановки чисел и пропускает
// записи, которые JavaScript понимает по-своему: "v // t" — это v и комментарий
// (ответ вышел бы просто v), "v ** 2" — возведение в степень, а число с нулем
// впереди, 010, — это 8 (запись в восьмеричной системе).
// what — название формулы для текста ошибки, например "Формула ответа"
function checkFormula(formula, what) {
    const text = checkText(formula, `${what}: формула не заполнена`);
    if (text.length > MAX_FORMULA_LENGTH) {
        fail(`${what}: формула должна быть не длиннее ${MAX_FORMULA_LENGTH} знаков`);
    }
    if (!/^[\w\s.+\-*/()]*$/.test(text)) {
        fail(`${what}: можно использовать только числа, имена величин, знаки + - * / и скобки`);
    }
    if (/\*\*|\/\/|\/\*/.test(text)) {
        fail(`${what}: недопустимое сочетание знаков **, // или /*`);
    }
    // Ноль, за которым идет цифра, в начале числа: перед нулем нет ни буквы, ни цифры, ни точки.
    // Так 010 и (07) находятся, а 10, 0.5, 1.05 и имя t05 — нет
    if (/(^|[^\w.])0\d/.test(text)) {
        fail(`${what}: число не может начинаться с нуля — пишите 10, а не 010`);
    }
    return text;
}

// Проверяет один вариант из списка choices: это число (2.7) или объект,
// у которого поля — числа или строки ({ "name": "меди", "ro": 8.9 }).
// Возвращает копию варианта.
// Number.isFinite отсеивает не только строки, но и бесконечность: JSON.parse('1e999')
// дает Infinity, а в файл Infinity записалось бы как null
function checkVariant(name, variant) {
    if (Number.isFinite(variant)) {
        return variant;
    }
    if (!isObject(variant) || Object.keys(variant).length === 0) {
        fail(`Параметр «${name}»: вариант должен быть числом или набором полей, например name: меди; ro: 8,9`);
    }

    const copy = {};
    for (const [field, value] of Object.entries(variant)) {
        checkName(field, `Параметр «${name}», поле`);
        const isText = typeof value === 'string' && value.trim() !== '';
        if (!Number.isFinite(value) && !isText) {
            fail(`Параметр «${name}», поле «${field}»: значение должно быть числом или текстом`);
        }
        if (isText && value.length > MAX_FIELD_LENGTH) {
            fail(`Параметр «${name}», поле «${field}»: текст должен быть не длиннее ${MAX_FIELD_LENGTH} знаков`);
        }
        copy[field] = value;
    }
    return copy;
}

// Проверяет описание одного случайного параметра и возвращает его копию,
// в которую попадают только нужные поля:
//   { "min": 1, "max": 5, "step": 0.5 } — число из диапазона (шаг можно не указывать)
//   { "choices": [ ... ] }              — один из вариантов
function checkParam(name, spec) {
    checkName(name, 'Параметр');
    if (!isObject(spec)) {
        fail(`Параметр «${name}» описан неверно`);
    }

    // Список вариантов
    if (spec.choices !== undefined) {
        if (!Array.isArray(spec.choices) || spec.choices.length === 0) {
            fail(`Параметр «${name}»: добавьте хотя бы один вариант`);
        }
        if (spec.choices.length > MAX_CHOICES) {
            fail(`Параметр «${name}»: вариантов должно быть не больше ${MAX_CHOICES}`);
        }
        // map проверяет каждый вариант и собирает новый массив из их копий
        return { choices: spec.choices.map((variant) => checkVariant(name, variant)) };
    }

    // Диапазон чисел
    if (!Number.isFinite(spec.min) || !Number.isFinite(spec.max)) {
        fail(`Параметр «${name}»: укажите числа «от» и «до»`);
    }
    if (spec.min > spec.max) {
        fail(`Параметр «${name}»: число «от» больше, чем «до»`);
    }

    const range = { min: spec.min, max: spec.max };
    // Шаг необязателен: если его нет, generator.js берет шаг 1
    if (spec.step !== undefined) {
        if (!Number.isFinite(spec.step) || spec.step <= 0) {
            fail(`Параметр «${name}»: шаг должен быть числом больше нуля`);
        }
        range.step = spec.step;
    }
    return range;
}

// Проверяет новую тему: { "id": "7_pressure", "grade": 7, "title": "Давление" }.
// Возвращает тему, в которой пока нет задач
function checkTopic(data) {
    // includes проверяет, есть ли значение в списке. Строка "7" не подойдет — нужно число
    if (![6, 7, 8].includes(data.grade)) {
        fail('Класс должен быть 6, 7 или 8');
    }

    const title = checkText(data.title, 'Введите название темы');
    if (title.length > 100) {
        fail('Название темы должно быть не длиннее 100 знаков');
    }

    // id — имя файла темы: "7_pressure" → tasks/7_pressure.json. Начинается с номера
    // класса и знака _, как у тем базы, дальше — латинские буквы, цифры и _
    // (\w в JavaScript — это именно они; так же имя темы проверяет loadTopic в server.js)
    const prefix = `${data.grade}_`;
    const isGoodId = typeof data.id === 'string' && data.id.startsWith(prefix)
        && /^\w{1,50}$/.test(data.id.slice(prefix.length));
    if (!isGoodId) {
        fail(`Имя файла должно начинаться с «${prefix}», дальше — от 1 до 50 латинских букв, цифр и _, например ${prefix}pressure`);
    }

    return { id: data.id, grade: data.grade, title: title, tasks: [] };
}

// Проверяет шаблон задачи и возвращает его «чистую» копию: только поля из README
// в том же порядке, что и в файлах tasks/*.json. Номера шаблона (id) здесь нет —
// его назначает сервер при сохранении
function checkTemplate(data) {
    if (!isObject(data)) {
        fail('Неверный запрос');
    }

    const text = checkText(data.text, 'Введите текст условия');
    if (text.length > MAX_TEXT_LENGTH) {
        fail(`Текст условия должен быть не длиннее ${MAX_TEXT_LENGTH} знаков`);
    }
    // Подстановки записываются в фигурных скобках: {v}. Уберем из текста все подстановки:
    // если скобки еще остались, у какой-то скобки нет пары, и ученик увидел бы ее в условии
    if (/[{}]/.test(text.replace(/\{[^{}]+\}/g, ''))) {
        fail('В тексте условия есть фигурная скобка без пары. Величина записывается так: {v}');
    }
    // match находит все подстановки; если их нет, он возвращает null — тогда берем пустой список
    if ((text.match(/\{[^{}]+\}/g) ?? []).length > MAX_PLACEHOLDERS) {
        fail(`В тексте условия должно быть не больше ${MAX_PLACEHOLDERS} подстановок {…}`);
    }

    if (!isObject(data.params) || Object.keys(data.params).length === 0) {
        fail('Добавьте хотя бы один случайный параметр');
    }
    if (Object.keys(data.params).length > MAX_NAMES) {
        fail(`Случайных параметров должно быть не больше ${MAX_NAMES}`);
    }
    const params = {};
    for (const [name, spec] of Object.entries(data.params)) {
        params[name] = checkParam(name, spec);
    }

    // Вычисляемые величины необязательны. Порядок сохраняется:
    // generator.js считает их по очереди, и каждая может использовать предыдущие
    const derived = {};
    if (data.derived !== undefined) {
        if (!isObject(data.derived)) {
            fail('Вычисляемые величины описаны неверно');
        }
        if (Object.keys(data.derived).length > MAX_NAMES) {
            fail(`Вычисляемых величин должно быть не больше ${MAX_NAMES}`);
        }
        for (const [name, formula] of Object.entries(data.derived)) {
            checkName(name, 'Величина');
            // Object.hasOwn — есть ли уже параметр с таким именем
            if (Object.hasOwn(params, name)) {
                fail(`Величина «${name}» уже есть среди случайных параметров`);
            }
            derived[name] = checkFormula(formula, `Формула величины «${name}»`);
        }
    }

    // Собираем шаблон по порядку полей, как в файлах базы
    const template = { text: text, params: params };
    if (Object.keys(derived).length > 0) {
        template.derived = derived; // Нет вычисляемых величин — нет и поля derived
    }
    template.answer = checkFormula(data.answer, 'Формула ответа');
    template.unit = checkText(data.unit, 'Укажите единицу измерения ответа');

    // Точность необязательна: если ее нет, ответ округляется до 2 знаков (getPrecision в generator.js)
    if (data.precision !== undefined) {
        if (!Number.isInteger(data.precision) || data.precision < 0 || data.precision > 6) {
            fail('Знаков после запятой — целое число от 0 до 6');
        }
        template.precision = data.precision;
    }

    return template;
}

// Ищет случайный параметр, который влияет на ответ, но не виден в тексте условия
// (например, его забыли подставить в текст). По очереди меняем у задачи task один параметр
// на значение из другой случайной задачи: если текст от этого не изменился, а ответ
// изменился, — ученик видит одно и то же условие, а правильные ответы у него разные.
// Возвращает имя такого параметра или null
function findHiddenParam(template, task) {
    const other = generateTask(template, null); // Другая случайная задача — источник новых значений
    for (const name of Object.keys(template.params)) {
        const params = { ...task.params }; // Копия значений задачи (... — «разворот» объекта)
        params[name] = other.params[name];  // Меняем только один параметр
        const values = computeValues(template, params);
        if (fillText(template.text, values) === task.text && computeAnswer(template, values) !== task.answer) {
            return name;
        }
    }
    return null;
}

// Пробно создает по шаблону TRIAL_COUNT задач. Так находятся ошибки, которые видны
// только на конкретных числах: неизвестная величина в тексте, деление на ноль.
// Возвращает { examples, warnings }: несколько разных задач для предпросмотра
// и предупреждения учителю (они, в отличие от ошибок, сохранению не мешают).
// Проверка случайная: очень редкое неудачное сочетание чисел может и не попасться
function tryTemplate(template) {
    const examples = [];
    const answers = new Map(); // Текст условия → ответ: у одинаковых условий ответ должен совпадать
    let rounded = null;        // Пример ответа, который пришлось округлить: { exact, answer }
    let longFraction = null;   // Пример условия с длинной дробью

    for (let i = 0; i < TRIAL_COUNT; i++) {
        let task;
        let exactAnswer;
        let hiddenParam = null;
        try {
            // Номер темы пробной задаче не нужен
            task = generateTask(template, null);
            // Точный (неокругленный) ответ — по тем же случайным значениям
            exactAnswer = evaluate(template.answer, computeValues(template, task.params));
            if (i < HIDDEN_CHECK_COUNT) {
                hiddenParam = findHiddenParam(template, task);
            }
        } catch (error) {
            // Ошибки generator.js — обычные Error с понятным текстом. А SyntaxError или
            // TypeError бросает сам JavaScript, когда не может выполнить формулу
            // (например, "v *"), и их текст английский
            const reason = error.name === 'Error' ? error.message : 'формула записана с ошибкой — проверьте знаки и скобки';
            fail(`Не удалось создать задачу: ${reason}`);
        }

        if (hiddenParam !== null) {
            fail(`Параметр «${hiddenParam}» влияет на ответ, но не виден в тексте условия: `
                + `при одном и том же условии «${task.text}» получаются разные ответы. Подставьте его в текст`);
        }

        // Одно и то же условие с разными ответами: какая-то величина влияет на ответ,
        // но не попала в текст, — ученик не сможет решить такую задачу
        if (answers.has(task.text) && answers.get(task.text) !== task.answer) {
            fail(`Условие «${task.text}» получилось с разными ответами `
                + `(${formatNumber(answers.get(task.text))} и ${formatNumber(task.answer)}): в тексте не хватает какой-то величины`);
        }

        // В примеры берем только разные условия
        if (!answers.has(task.text) && examples.length < EXAMPLE_COUNT) {
            examples.push({ text: task.text, answer: formatNumber(task.answer) });
        }
        answers.set(task.text, task.answer);

        if (rounded === null && exactAnswer !== task.answer) {
            rounded = { exact: exactAnswer, answer: task.answer };
        }
        // Длинная дробь вроде 0,3333333333 в условии: formatNumber пишет до 10 знаков
        if (longFraction === null && /\d,\d{5,}/.test(task.text)) {
            longFraction = task.text;
        }
    }

    const warnings = [];
    // Правило README: если ответ получается неточным, в условии должно быть сказано,
    // как его округлить
    if (rounded !== null && !/округл/i.test(template.text)) {
        warnings.push(`Ответ не всегда получается точным: например, ${formatNumber(rounded.exact)} `
            + `округляется до ${formatNumber(rounded.answer)}. Допишите в условие, до скольких знаков `
            + 'округлить ответ (например, «Ответ округлите до десятых»), или подберите другие числа');
    }
    if (answers.size === 1) {
        warnings.push('Все пробные задачи получились одинаковыми: проверьте, что в тексте есть подстановки вида {v} и что у параметров больше одного значения');
    }
    if (longFraction !== null) {
        warnings.push(`В условии получается длинная дробь: «${longFraction}». Подберите параметры так, чтобы числа в условии были «круглыми»`);
    }

    return { examples: examples, warnings: warnings };
}

// Делаем функции доступными для server.js (подключается через require('./validator.js'))
module.exports = {
    checkTopic,
    checkTemplate,
    tryTemplate
};
