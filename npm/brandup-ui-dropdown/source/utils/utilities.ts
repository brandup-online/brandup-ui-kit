const REGEX_CHAR = /\p{L}/u

const languages: { [keys in Language]: string } = {
    english: "qwertyuiopasdfghjklzxcvbnm",
    russian: "йцукенгшщзхъфывапролджэячсмитьбю",
};

// prettier-ignore
const english_russian_dict: ICharMap = {
    q: "й", w: "ц", e: "у", r: "к", t: "е", y: "н", u: "г", i: "ш", o: "щ", p: "з", "[": "х", "]": "ъ",
    a: "ф", s: "ы", d: "в", f: "а", g: "п", h: "р", j: "о", k: "л", l: "д", ";": "ж", "'": "э",
    z: "я", x: "ч", c: "с", v: "м", b: "и", n: "т", m: "ь", ",": "б", ".": "ю", "/": ".",
    "{": "Х", "}": "Ъ", ":": "Ж", '"': "Э", "<": "Б", ">": "Ю", "?": ","
};

// prettier-ignore
const russian_english_dict: ICharMap = {
    й: "q", ц: "w", у: "e", к: "r", е: "t", н: "y", г: "u", ш: "i", щ: "o", з: "p", х: "[", ъ: "]",
    ф: "a", ы: "s", в: "d", а: "f", п: "g", р: "h", о: "j", л: "k", д: "l", ж: ";", э: "'",
    я: "z", ч: "x", с: "c", м: "v", и: "b", т: "n", ь: "m", б: ",", ю: ".", ".": "/",
    "Х": "{", "Ъ": "}", "Ж": ":", "Э": '"', "Б": "<", "Ю": ">", ",": "?"
};

interface ICharMap {
    [keys: string]: string;
}

type ITranscriptMap = {
    // {целевой язык: {язык ввода: словарь}}
    [keys in Language]: { [keys: string]: ICharMap };
};

const dictionariesMap: ITranscriptMap = {
    russian: { english: russian_english_dict },
    english: { russian: english_russian_dict },
};

export type Language = "english" | "russian";

export const detectLanguage = (text: string) => {
    if (!text)
        return null;

    const match = text.match(REGEX_CHAR);
    if (!match)
        return null;

    const firstChar = match[0].toLocaleLowerCase();
    for (const lang in languages) {
        if (languages[<Language>lang].includes(firstChar))
            return lang as Language;
    }

    return null;
};

export const transcriptText = (text: string) => {
    const transcriptVariants: { [keys: string]: string; } = {};

    const textLanguage = detectLanguage(text);
    if (textLanguage) {
        const textArr: string[] = Array.from(text.toLowerCase());
        for (const lang in dictionariesMap[textLanguage]) {
            const langVariant = dictionariesMap[textLanguage][lang];

            const transcript = textArr.reduce((prev, current) => prev + (langVariant[current] || current), "");
            transcriptVariants[lang] = transcript;
        }
    }

    return transcriptVariants;
};