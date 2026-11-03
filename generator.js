// Генератор задач.
// Превращает шаблон задачи из JSON-файла (папка tasks/) в конкретную задачу
// со случайными числами. Файл подключается на сервере (server.js): сервер создает
// задачи и проверяет ответы, поэтому браузеру этот файл не нужен и не отдается.
// Формулы ответов хранятся в шаблонах tasks/*.json — их сервер тоже не отдает.

// Случайное целое число от min до max включительно
function randomInt(min, max) {
    // Math.random() дает число от 0 до 1. Умножаем на количество вариантов и округляем вниз.
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Случайный элемент массива
function pickRandom(array) {
    return array[randomInt(0, array.length - 1)];
}

// Возвращает новый массив с теми же элементами в случайном порядке.
// Исходный массив не меняется: например, шаблоны темы остаются на своих местах.
// Алгоритм Фишера — Йетса: идем от конца копии к началу и меняем каждый элемент
// местами со случайным элементом, стоящим не дальше него (может выпасть и он сам).
// Так все порядки элементов получаются равновероятными
function shuffle(array) {
    const result = [...array]; // Копия массива (... — «разворот» элементов в новый массив)
    for (let i = result.length - 1; i > 0; i--) {
        const j = randomInt(0, i);
        [result[i], result[j]] = [result[j], result[i]]; // Меняем местами i-й и j-й элементы
    }
    return result;
}

// Убирает погрешность вычислений с дробными числами.
// Компьютер хранит дроби неточно: 0.1 + 0.2 = 0.30000000000000004.
// Оставляем 12 значащих цифр — «хвост» пропадает, и получается 0.3
function cleanNumber(value) {
    return parseFloat(value.toPrecision(12));
}

// Случайное значение одного параметра по его описанию из JSON:
//   { "min": 1, "max": 5 }                — целое число от 1 до 5
//   { "min": 0.5, "max": 3, "step": 0.5 } — число от 0.5 до 3 с шагом 0.5
//   { "choices": [ ... ] }                — один из перечисленных вариантов
//                                           (число или объект, например вещество с его плотностью)
function randomParam(spec) {
    if (spec.choices) {
        return pickRandom(spec.choices);
    }

    const step = spec.step ?? 1; // Если шаг не указан, он равен 1

    // Сколько целых шагов помещается в диапазоне.
    // cleanNumber убирает погрешность: (1 - 0.3) / 0.1 = 6.999999999999999 → 7,
    // а Math.floor отбрасывает неполный шаг, чтобы число не вышло за max
    const stepsCount = Math.floor(cleanNumber((spec.max - spec.min) / step));

    return cleanNumber(spec.min + step * randomInt(0, stepsCount));
}

// Достает значение по имени: "v" → values.v, "material.ro" → values.material.ro.
// Берем только собственные свойства объекта (Object.hasOwn), чтобы через имя
// нельзя было добраться до встроенных свойств JavaScript (например, constructor).
// Если значения с таким именем нет, возвращает undefined.
function getValue(values, name) {
    const parts = name.split('.');
    if (parts.length > 2 || !Object.hasOwn(values, parts[0])) return undefined;

    const value = values[parts[0]];
    if (parts.length === 1) return value;

    // Поле можно взять только у объекта — варианта из choices, например material.ro
    if (typeof value !== 'object' || value === null) return undefined;
    return Object.hasOwn(value, parts[1]) ? value[parts[1]] : undefined;
}

// Вычисляет формулу из JSON, например "v * t" или "material.ro * V".
// Формула — это строка, а выполнять строку как код опасно: в нее можно записать что угодно.
// Поэтому сначала заменяем каждое имя его числом ("v * t" → "(12) * (3)"),
// затем проверяем, что остались только цифры, точка, скобки и знаки + - * /,
// и только такую безопасную строку выполняем с помощью Function.
function evaluate(formula, values) {
    const expression = formula.replace(/\b[A-Za-z_]\w*(\.\w+)?/g, (name) => {
        const value = getValue(values, name);
        // Например, в варианте записали "ro: 8,9 г/см³" — с единицами это уже текст, а не число
        if (typeof value === 'string') {
            throw new Error(`Величина "${name}" записана текстом ("${value}"), а в формуле нужно число — уберите единицы измерения`);
        }
        if (typeof value !== 'number') {
            throw new Error(`Неизвестная величина "${name}" в формуле "${formula}"`);
        }
        return `(${value})`; // Скобки нужны для отрицательных чисел: 5 - (-2)
    });

    // Буква e допустима только внутри чисел вида 1e-7 — все имена к этому моменту уже заменены
    if (!/^[\d\s.e+\-*/()]*$/.test(expression)) {
        throw new Error(`Недопустимые символы в формуле "${formula}"`);
    }

    const calculate = new Function(`return ${expression};`);
    const result = calculate();

    if (!Number.isFinite(result)) {
        throw new Error(`Формула "${formula}" дала результат ${result}`);
    }
    return cleanNumber(result);
}

// Записывает число по-русски: десятичная запятая и пробелы между разрядами
// у больших чисел (2.5 → "2,5", 42000 → "42 000", но 4200 → "4200", как в учебниках)
function formatNumber(value) {
    return value.toLocaleString('ru-RU', { maximumFractionDigits: 10, useGrouping: 'min2' });
}

// Подставляет значения в текст условия вместо {имя} или {имя.поле}:
// "Ехал {t} ч" → "Ехал 3 ч", "Деталь из {material.name}" → "Деталь из меди"
function fillText(text, values) {
    return text.replace(/\{([^{}]+)\}/g, (placeholder, name) => {
        const value = getValue(values, name);
        if (typeof value === 'number') return formatNumber(value);
        if (typeof value === 'string') return value;
        throw new Error(`Неизвестная величина ${placeholder} в тексте задачи`);
    });
}

// Шаг 1. Случайные значения всех параметров шаблона
function generateParams(template) {
    const params = {};
    for (const [name, spec] of Object.entries(template.params)) {
        params[name] = randomParam(spec);
    }
    return params;
}

// Шаг 2. Все величины задачи: случайные параметры + вычисляемые (derived).
// Вычисляемые считаются по порядку и могут использовать предыдущие.
// Пример: скорость v и время t выбраны случайно, а путь s = v * t вычислен.
// В задаче «найдите скорость по пути и времени» ответ тогда всегда «красивый».
function computeValues(template, params) {
    const values = { ...params }; // Копия, чтобы не изменить сами params
    for (const [name, formula] of Object.entries(template.derived ?? {})) {
        values[name] = evaluate(formula, values);
    }
    return values;
}

// Сколько знаков после запятой оставлять в ответе.
// Если precision в шаблоне не указан — 2 знака
function getPrecision(template) {
    return template.precision ?? 2;
}

// Шаг 3. Правильный ответ, округленный до precision знаков после запятой
function computeAnswer(template, values) {
    const answer = evaluate(template.answer, values);
    const factor = 10 ** getPrecision(template);

    // Сдвигаем запятую, округляем до целого и сдвигаем обратно: 4.35 → 43.5 → 44 → 4.4.
    // cleanNumber нужен и здесь: 0.145 * 100 = 14.499999999999998, и без него
    // при precision = 2 получилось бы 0.14 вместо 0.15
    const rounded = Math.round(cleanNumber(answer * factor)) / factor;

    // Math.round(-0.3) дает -0 («минус ноль»), и formatNumber записал бы ответ как "-0".
    // -0 === 0 считается верным, поэтому для любого нуля возвращаем обычный 0
    return rounded === 0 ? 0 : rounded;
}

// Создает конкретную задачу из шаблона.
// Случайные значения сохраняются в поле params — это и есть хранение рандомизации
// в условии задачи: по номеру темы, номеру шаблона и params задачу можно
// воспроизвести и заново вычислить правильный ответ.
function generateTask(template, topicId) {
    const params = generateParams(template);
    const values = computeValues(template, params);

    return {
        topicId: topicId,                           // Тема, например "7_mechanics"
        taskId: template.id,                        // Номер шаблона внутри темы
        params: params,                             // Сохраненные случайные значения
        text: fillText(template.text, values),      // Текст условия с подставленными числами
        answer: computeAnswer(template, values),    // Правильный ответ (при проверке сервер вычисляет его заново по params)
        unit: template.unit                         // Единица измерения ответа
    };
}

// Делаем функции доступными для server.js и validator.js.
// В Node.js каждый файл — отдельный модуль: другой файл получает только то,
// что перечислено в module.exports, когда подключает его через require('./generator.js')
module.exports = {
    shuffle,
    cleanNumber,
    evaluate,
    formatNumber,
    fillText,
    computeValues,
    getPrecision,
    computeAnswer,
    generateTask
};
