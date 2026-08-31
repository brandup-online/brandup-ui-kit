import { DOM } from "@brandup/ui";
import { PopupManager } from "@brandup/ui-kit";
import { UIKIT } from "@brandup/ui-kit/names";
import { RICHEDITOR } from "./names";

// Набор смайликов для панели вставки. Все символы — одиночные кодпойнты (без ZWJ-последовательностей
// и модификаторов), поэтому переносятся в текст как единое целое. Внимание: в UTF-16 каждый занимает
// две единицы, и getLength() (а значит и maxlength у хоста) считает такой символ за два.
//
// Разложены по группам: панель рисует их в том же порядке и отделяет линией, а заодно группа —
// это кусок, к которому применяется пропуск отрисовки (см. .emoji-group в richeditor.less).

/** Группа смайликов в панели вставки. */
export interface EmojiGroup {
	/** Название группы; в панели не показывается, уходит в подпись для скринридера. */
	title: string;
	emojis: string[];
}

/** Смайлики по группам (порядок сохраняется в UI). */
export const EMOJI_GROUPS: EmojiGroup[] = [
	{
		title: "Смайлы и жесты",
		// prettier-ignore
		emojis: [
			"😀", "😁", "😂", "😃", "😄", "😅", "😆", "😉", "😊", "😋", "😌", "😍", "😏", "😒", "😓", "😔",
			"😖", "😘", "😚", "😜", "😝", "😞", "😠", "😡", "😢", "😣", "😤", "😥", "😨", "😩", "😪", "😫",
			"😭", "😰", "😱", "😲", "😳", "😵", "😷", "😸", "😹", "😺", "😻", "😼", "😽", "😾", "😿", "🙀",
			"🙅", "🙆", "🙇", "🙈", "🙉", "🙊", "🙋", "🙌", "🙍", "🙎", "🙏", "😇", "😈", "😎", "😐", "😑",
			"😕", "😗", "😙", "😛", "😟", "😦", "😧", "😬", "😮", "😯", "😴", "😶",
		],
	},
	{
		title: "Люди",
		// prettier-ignore
		emojis: [
			"👀", "👂", "👃", "👄", "👅", "👆", "👇", "👈", "👉", "👊", "👋", "👌", "👍", "👎", "👏", "👐",
			"👑", "👒", "👓", "👔", "👕", "👖", "👗", "👘", "👙", "👚", "👛", "👜", "👝", "👞", "👟", "👠",
			"👡", "👢", "👣", "👤", "👦", "👧", "👨", "👩", "👪", "👫", "👮", "👯", "👰", "👱", "👲", "👳",
			"👴", "👵", "👶", "👷", "👸", "👹", "👺", "👻", "👼", "👽", "👾", "👿", "💀", "💁", "💂", "💃",
			"💄", "💅", "💆", "💇", "💏", "💑", "👥", "👬", "👭",
		],
	},
	{
		title: "Животные",
		// prettier-ignore
		emojis: [
			"🐌", "🐍", "🐎", "🐑", "🐒", "🐔", "🐗", "🐘", "🐙", "🐚", "🐛", "🐜", "🐝", "🐞", "🐟", "🐠",
			"🐡", "🐢", "🐣", "🐤", "🐥", "🐦", "🐧", "🐨", "🐩", "🐫", "🐬", "🐭", "🐮", "🐯", "🐰", "🐱",
			"🐲", "🐳", "🐴", "🐵", "🐶", "🐷", "🐸", "🐹", "🐺", "🐻", "🐼", "🐽", "🐾", "🐀", "🐁", "🐂",
			"🐃", "🐄", "🐅", "🐆", "🐇", "🐈", "🐉", "🐊", "🐋", "🐏", "🐐", "🐓", "🐕", "🐖", "🐪",
		],
	},
	{
		title: "Природа",
		// prettier-ignore
		emojis: [
			"🌀", "🌁", "🌂", "🌃", "🌄", "🌅", "🌆", "🌇", "🌈", "🌉", "🌊", "🌋", "🌌", "🌏", "🌑", "🌓",
			"🌔", "🌕", "🌙", "🌛", "🌟", "🌠", "🌰", "🌱", "🌴", "🌵", "🌷", "🌸", "🌹", "🌺", "🌻", "🌼",
			"🌽", "🌾", "🌿", "🍀", "🍁", "🍂", "🍃", "🌍", "🌎", "🌐", "🌒", "🌖", "🌗", "🌘", "🌚", "🌜",
			"🌝", "🌞", "🌲", "🌳",
		],
	},
	{
		title: "Еда",
		// prettier-ignore
		emojis: [
			"🍄", "🍅", "🍆", "🍇", "🍈", "🍉", "🍊", "🍌", "🍍", "🍎", "🍏", "🍑", "🍒", "🍓", "🍔", "🍕",
			"🍖", "🍗", "🍘", "🍙", "🍚", "🍛", "🍜", "🍝", "🍞", "🍟", "🍠", "🍡", "🍢", "🍣", "🍤", "🍥",
			"🍦", "🍧", "🍨", "🍩", "🍪", "🍫", "🍬", "🍭", "🍮", "🍯", "🍰", "🍱", "🍲", "🍳", "🍴", "🍵",
			"🍶", "🍷", "🍸", "🍹", "🍺", "🍻", "🍋", "🍐", "🍼",
		],
	},
	{
		title: "Праздники и спорт",
		// prettier-ignore
		emojis: [
			"🎀", "🎁", "🎂", "🎃", "🎄", "🎅", "🎆", "🎇", "🎈", "🎉", "🎊", "🎋", "🎌", "🎍", "🎎", "🎏",
			"🎐", "🎑", "🎒", "🎓", "🎠", "🎡", "🎢", "🎣", "🎤", "🎥", "🎦", "🎧", "🎨", "🎩", "🎪", "🎫",
			"🎬", "🎭", "🎮", "🎯", "🎰", "🎱", "🎲", "🎳", "🎴", "🎵", "🎶", "🎷", "🎸", "🎹", "🎺", "🎻",
			"🎼", "🎽", "🎾", "🎿", "🏀", "🏁", "🏂", "🏃", "🏄", "🏆", "🏈", "🏊", "🏇", "🏉",
		],
	},
	{
		title: "Места",
		// prettier-ignore
		emojis: [
			"🏠", "🏡", "🏢", "🏣", "🏥", "🏦", "🏧", "🏨", "🏩", "🏪", "🏫", "🏬", "🏭", "🏮", "🏯", "🏰",
			"🗻", "🗼", "🗽", "🗾", "🗿", "🏤",
		],
	},
	{
		title: "Транспорт",
		// prettier-ignore
		emojis: [
			"🚀", "🚃", "🚄", "🚅", "🚇", "🚉", "🚌", "🚏", "🚑", "🚒", "🚓", "🚕", "🚗", "🚙", "🚚", "🚢",
			"🚤", "🚥", "🚧", "🚨", "🚩", "🚪", "🚫", "🚬", "🚭", "🚲", "🚶", "🚹", "🚺", "🚻", "🚼", "🚽",
			"🚾", "🛀", "🚁", "🚂", "🚆", "🚈", "🚊", "🚍", "🚎", "🚐", "🚔", "🚖", "🚘", "🚛", "🚜", "🚝",
			"🚞", "🚟", "🚠", "🚡", "🚣", "🚦", "🚮", "🚯", "🚰", "🚱", "🚳", "🚴", "🚵", "🚷", "🚸", "🚿",
			"🛁", "🛂", "🛃", "🛄", "🛅",
		],
	},
	{
		title: "Предметы",
		// prettier-ignore
		emojis: [
			"💈", "💉", "💊", "💋", "💌", "💍", "💎", "💐", "💠", "💡", "💰", "💱", "💲", "💳", "💴", "💵",
			"💸", "💹", "💺", "💻", "💼", "💽", "💾", "💿", "📀", "📁", "📂", "📃", "📄", "📅", "📆", "📇",
			"📈", "📉", "📊", "📋", "📌", "📍", "📎", "📏", "📐", "📑", "📒", "📓", "📔", "📕", "📖", "📗",
			"📘", "📙", "📚", "📛", "📜", "📝", "📞", "📟", "📠", "📡", "📢", "📣", "📤", "📥", "📦", "📧",
			"📨", "📩", "📪", "📫", "📮", "📰", "📱", "📲", "📳", "📴", "📶", "📷", "📹", "📺", "📻", "📼",
			"💶", "💷", "📬", "📭", "📯", "📵",
		],
	},
	{
		title: "Символы",
		// prettier-ignore
		emojis: [
			"🅰", "🅱", "🅾", "🅿", "🆎", "🆑", "🆒", "🆓", "🆔", "🆕", "🆖", "🆗", "🆘", "🆙", "🆚", "🈁",
			"🈂", "🈚", "🈯", "🈲", "🈳", "🈴", "🈵", "🈶", "🈷", "🈸", "🈹", "🈺", "🉐", "🉑", "🀄", "🃏",
			"💒", "💓", "💔", "💕", "💖", "💗", "💘", "💙", "💚", "💛", "💜", "💝", "💞", "💟", "💢", "💣",
			"💤", "💥", "💦", "💧", "💨", "💩", "💪", "💫", "💬", "💮", "💯", "🔃", "🔊", "🔋", "🔌", "🔍",
			"🔎", "🔏", "🔐", "🔑", "🔒", "🔓", "🔔", "🔖", "🔗", "🔘", "🔙", "🔚", "🔛", "🔜", "🔝", "🔞",
			"🔟", "🔠", "🔡", "🔢", "🔣", "🔤", "🔥", "🔦", "🔧", "🔨", "🔩", "🔪", "🔫", "🔮", "🔯", "🔰",
			"🔱", "🔲", "🔳", "🔴", "🔵", "🔶", "🔷", "🔸", "🔹", "🔺", "🔻", "🔼", "🔽", "🕐", "🕑", "🕒",
			"🕓", "🕔", "🕕", "🕖", "🕗", "🕘", "🕙", "🕚", "🕛", "💭", "🔀", "🔁", "🔂", "🔄", "🔅", "🔆",
			"🔇", "🔉", "🔕", "🔬", "🔭", "🕜", "🕝", "🕞", "🕟", "🕠", "🕡", "🕢", "🕣", "🕤", "🕥", "🕦",
			"🕧",
		],
	},
];

/** Все смайлики подряд, в порядке групп. */
export const EMOJIS: string[] = EMOJI_GROUPS.flatMap((group) => group.emojis);

// --- панель вставки ---

/**
 * Группа смайликов: и смысловое деление в панели (отбивается линией), и кусок, к которому
 * применяется пропуск отрисовки. Поэлементно это было бы семьсот отслеживаемых поддеревьев,
 * и слежение за ними съедает выигрыш от пропуска.
 */
function buildEmojiGroup(group: EmojiGroup): HTMLElement {
	const rows = Math.ceil(group.emojis.length / RICHEDITOR.VALUE.EMOJI_COLUMNS);
	const elem = DOM.tag("div", {
		class: "emoji-group",
		role: "group",
		"aria-label": group.title,
		// высота, пока группа не нарисована: без неё список схлопнулся бы, а прокрутка скакала
		style: `--richeditor-emoji-rows: ${rows}`,
	});

	const fragment = document.createDocumentFragment();
	for (const emoji of group.emojis)
		fragment.appendChild(DOM.tag("button", { type: "button", class: "emoji", tabindex: "-1" }, emoji));
	elem.appendChild(fragment);

	return elem;
}

// --- недавние ---

// в панели название не показывается, уходит в подпись для скринридера — как у остальных групп
const RECENT_TITLE = "Недавние";

const KNOWN_EMOJIS = new Set(EMOJIS);

/**
 * Недавно вставленные смайлики, свежий первым.
 *
 * Хранилище общее и переживает версии пакета, поэтому список чистится до символов, которые
 * панель действительно показывает: мусор и дубликаты отбрасываются. Недоступное или битое
 * хранилище (приватный режим, правленое руками значение) — это пустой список, а не ошибка.
 */
export function recentEmojis(): string[] {
	let raw: string | null;
	try {
		raw = localStorage.getItem(RICHEDITOR.STORAGE.RECENT_EMOJIS);
	} catch {
		return [];
	}
	if (!raw) return [];

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return [];
	}
	if (!Array.isArray(parsed)) return [];

	// Set сохраняет порядок вставки, а повторное add место не меняет — первый и остаётся
	const recent = new Set<string>();
	for (const item of parsed) {
		if (typeof item === "string" && KNOWN_EMOJIS.has(item)) recent.add(item);
		if (recent.size === RICHEDITOR.VALUE.RECENT_EMOJIS_LIMIT) break;
	}

	return Array.from(recent);
}

/**
 * Запоминает выбор для группы недавних: символ встаёт первым, дубликат схлопывается, хвост за
 * лимитом отбрасывается. Недоступное хранилище вставке не мешает — недавние просто не копятся.
 */
export function rememberEmoji(emoji: string): void {
	if (!KNOWN_EMOJIS.has(emoji)) return;

	const next = [emoji, ...recentEmojis().filter((other) => other !== emoji)].slice(0, RICHEDITOR.VALUE.RECENT_EMOJIS_LIMIT);
	try {
		localStorage.setItem(RICHEDITOR.STORAGE.RECENT_EMOJIS, JSON.stringify(next));
	} catch {
		// приватный режим или переполненная квота — вставка работает, недавние не запоминаются
	}
}

/**
 * Пересобирает группу недавних в собранном попапе по текущему хранилищу.
 *
 * Зовётся при каждом показе (см. `openEmojiPicker` в ./richeditor): сам попап живёт между
 * открытиями, а хранилище тем временем пополняют и другие попапы страницы. Без недавних группы
 * нет вовсе — пустая первая группа рисовала бы лишнюю отбивку над списком.
 */
export function refreshRecentEmojis(picker: HTMLElement): void {
	const list = picker.querySelector(".emoji-list");
	if (!list) return;

	const existing = list.querySelector(`.${RICHEDITOR.CLASS.EMOJI.RECENT_GROUP}`);
	const recent = recentEmojis();

	if (!recent.length) {
		existing?.remove();
		return;
	}

	const group = buildEmojiGroup({ title: RECENT_TITLE, emojis: recent });
	group.classList.add(RICHEDITOR.CLASS.EMOJI.RECENT_GROUP);

	if (existing) existing.replaceWith(group);
	else list.prepend(group);
}

/**
 * Собирает попап вставки смайлика.
 *
 * Попап принадлежит тому, кто его собрал: у панели форматирования свой, у поля сообщения — свой.
 * Общий на всех пришлось бы переносить между владельцами и помнить, чей он сейчас; а показать
 * два разом всё равно нельзя — {@link PopupManager} держит открытым один.
 *
 * Показом и закрытием занимается вызывающий (у редактора для этого есть `openEmojiPicker`):
 * здесь только разметка и выбор символа. Первой группой — недавние ({@link refreshRecentEmojis});
 * показ обязан освежать её сам, здесь она собирается по состоянию хранилища на сейчас.
 */
export function createEmojiPicker(onPick: (emoji: string) => void): HTMLElement {
	const picker = DOM.tag("div", { class: `${UIKIT.POPUP.CLASS.ROOT} ${RICHEDITOR.CLASS.EMOJI.PICKER}` });

	// Прокручивается список, а не сам попап: полоса прокрутки рисуется по краю коробки
	// и перекрывала бы скругление рамки — угол выглядел бы срезанным.
	const list = DOM.tag("div", { class: ["emoji-list", UIKIT.SCROLLABLE.CLASS] });
	picker.appendChild(list);

	for (const group of EMOJI_GROUPS) list.appendChild(buildEmojiGroup(group));
	refreshRecentEmojis(picker);

	// попап живёт и вне панели, поэтому фокус гасит сам
	picker.addEventListener("mousedown", (e) => e.preventDefault());
	picker.addEventListener("click", (e) => {
		const target = (e.target as HTMLElement).closest<HTMLElement>(".emoji");
		if (!target) return;

		const emoji = target.textContent ?? "";
		// Недавние — про то, к чему тянутся, поэтому запоминается сам выбор, а не вставка:
		// удалась ли она (filterChar, снятый редактор), знает только владелец попапа.
		rememberEmoji(emoji);
		onPick(emoji);

		// This panel is closed, not everything that is open: the editor is sometimes shown inside
		// someone else's popup, and that popup is no obstacle to this choice — closing it would take
		// away the form the user is writing in.
		PopupManager.close(picker);
	});

	return picker;
}
