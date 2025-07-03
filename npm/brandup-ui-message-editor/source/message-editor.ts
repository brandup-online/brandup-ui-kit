import { DOM } from "@brandup/ui-dom";
import { WordHelper } from "@brandup/ui-helpers";
import { InputControl } from "@brandup/ui-input";

import "./message-editor.less";

import formatBoldIcon from "./svg/format.svg";
import formatItalicIcon from "./svg/italic.svg";
import formatStrikethroughIcon from "./svg/crossed.svg";
import formatEraserIcon from "./svg/eraser.svg";
import emodjiHappyIcon from "./svg/smile.svg";
import closeIcon from "./svg/cancel.svg";
import undoIcon from "./svg/arrow-return-left.svg";
import redoIcon from "./svg/arrow-return-right.svg";
import randomizationIcon from "./svg/random.svg";

// "😂","🤣","❤","🥺","🥰","😘","😭","😍","😁","🙏","😅","😆","😊","🙂","😔","🥳","😒","☺","🎂","👍","💖","😢","🙄","😏","😎","💋","😞","😉","👏","🙃","😡","😀","😄","😇","🤩","😌","🤔","🌹","😋","💗","🤗","💕","💔","😚","☹","😃","🎉","🔥","🥴","😳"

// "😀","😃","😄","😁","😆","🥹","😅","😂","🤣","🥲","☺️","😊","😇","🙂","🙃","😉","😌","😍","🥰","😘","😗","😙","😚","😋","😛","😝","😜","🤪","🤨","🧐","🤓","😎","🥸","🤩","🥳","😏","😒","😞","😔","😟","😕","🙁","☹️","😣","😖","😫","😩","🥺","😢","😭","😤","😠","😡","🤬","🤯","😳","🥵","🥶","😶‍🌫️","😱","😨","😰","😥","😓","🤗","🤔","🫣","🤭","🫢","🫡","🤫","🫠","🤥","😶","🫥","😐","🫤","😑","😬","🙄","😯","😦","😧","😮","😲","🥱","😴","🤤","😪","😮‍💨","😵","😵‍💫","🤐","🥴","🤢","🤮","🤧","😷","🤒","🤕","🤑","🤠","😈","👿","👹","👺","🤡","💩","👻","💀","☠️","👽","👾","🤖","🎃","😺","😸","😹","😻","😼","😽","🙀","😿","😾","🫶","🤲","👐","🙌","👏","🤝","👍","👎","👊","✊","🤛","🤜","🤞","✌️","🫰","🤟","🤘","👌","🤌","🤏","🫳","🫴","👈","👉","👆","👇","☝️","✋","🤚","🖐️","🖖","👋","🤙","🫲","🫱","💪","🦾","🖕","✍️","🙏","🫵","🦶","🦵","🦿","💄","💋","👄","🫦","🦷","👅","👂","🦻","👃","👣","👁️","👀","🫀","🫁","🧠","🗣️","👤","👥","🫂","👶","👧","🧒","👦","👩","🧑","👨","👩‍🦱","🧑‍🦱","👨‍🦱","👩‍🦰","🧑‍🦰","👨‍🦰","👱‍♀️","👱","👱‍♂️","👩‍🦳","🧑‍🦳","👨‍🦳","👩‍🦲","🧑‍🦲","👨‍🦲","🧔‍♀️","🧔","🧔‍♂️","👵","🧓","👴","👲","👳‍♀️","👳","👳‍♂️","🧕","👮‍♀️","👮","👮‍♂️","👷‍♀️","👷","👷‍♂️","💂‍♀️","💂","💂‍♂️","🕵️‍♀️","🕵️","🕵️‍♂️","👩‍⚕️","🧑‍⚕️","👨‍⚕️","👩‍🌾","🧑‍🌾","👨‍🌾","👩‍🍳","🧑‍🍳","👨‍🍳","👩‍🎓","🧑‍🎓","👨‍🎓","👩‍🎤","🧑‍🎤","👨‍🎤","👩‍🏫","🧑‍🏫","👨‍🏫","👩‍🏭","🧑‍🏭","👨‍🏭","👩‍💻","🧑‍💻","👨‍💻","👩‍💼","🧑‍💼","👨‍💼","👩‍🔧","🧑‍🔧","👨‍🔧","👩‍🔬","🧑‍🔬","👨‍🔬","👩‍🎨","🧑‍🎨","👨‍🎨","👩‍🚒","🧑‍🚒","👨‍🚒","👩‍✈️","🧑‍✈️","👨‍✈️","👩‍🚀","🧑‍🚀","👨‍🚀","👩‍⚖️","🧑‍⚖️","👨‍⚖️","👰‍♀️","👰","👰‍♂️","🤵‍♀️","🤵","🤵‍♂️","👸","🫅","🤴","🥷","🦸‍♀️","🦸","🦸‍♂️","🦹‍♀️","🦹","🦹‍♂️","🤶","🧑‍🎄","🎅","🧙‍♀️","🧙","🧙‍♂️","🧝‍♀️","🧝","🧝‍♂️","🧌","🧛‍♀️","🧛","🧛‍♂️","🧟‍♀️","🧟","🧟‍♂️","🧞‍♀️","🧞","🧞‍♂️","🧜‍♀️","🧜","🧜‍♂️","🧚‍♀️","🧚","🧚‍♂️","👼","🤰","🫄","🫃","🤱","👩‍🍼","🧑‍🍼","👨‍🍼","🙇‍♀️","🙇","🙇‍♂️","💁‍♀️","💁","💁‍♂️","🙅‍♀️","🙅","🙅‍♂️","🙆‍♀️","🙆","🙆‍♂️","🙋‍♀️","🙋","🙋‍♂️","🧏‍♀️","🧏","🧏‍♂️","🤦‍♀️","🤦","🤦‍♂️","🤷‍♀️","🤷","🤷‍♂️","🙎‍♀️","🙎","🙎‍♂️","🙍‍♀️","🙍","🙍‍♂️","💇‍♀️","💇","💇‍♂️","💆‍♀️","💆","💆‍♂️","🧖‍♀️","🧖","🧖‍♂️","💅","🤳","💃","🕺","👯‍♀️","👯","👯‍♂️","🕴️","👩‍🦽","🧑‍🦽","👨‍🦽","👩‍🦼","🧑‍🦼","👨‍🦼","🚶‍♀️","🚶","🚶‍♂️","👩‍🦯","🧑‍🦯","👨‍🦯","🧎‍♀️","🧎","🧎‍♂️","🏃‍♀️","🏃","🏃‍♂️","🧍‍♀️","🧍","🧍‍♂️","👫","👭","👬","👩‍❤️‍👨","👩‍❤️‍👩","💑","👨‍❤️‍👨","👩‍❤️‍💋‍👨","👩‍❤️‍💋‍👩","💏","👨‍❤️‍💋‍👨","👨‍👩‍👦","👨‍👩‍👧","👨‍👩‍👧‍👦","👨‍👩‍👦‍👦","👨‍👩‍👧‍👧","👩‍👩‍👦","👩‍👩‍👧","👩‍👩‍👧‍👦","👩‍👩‍👦‍👦","👩‍👩‍👧‍👧","👨‍👨‍👦","👨‍👨‍👧","👨‍👨‍👧‍👦","👨‍👨‍👦‍👦","👨‍👨‍👧‍👧","👩‍👦","👩‍👧","👩‍👧‍👦","👩‍👦‍👦","👩‍👧‍👧","👨‍👦","👨‍👧","👨‍👧‍👦","👨‍👦‍👦","👨‍👧‍👧","🪢","🧶","🧵","🪡","🧥","🥼","🦺","👚","👕","👖","🩲","🩳","👔","👗","👙","🩱","👘","🥻","🩴","🥿","👠","👡","👢","👞","👟","🥾","🧦","🧤","🧣","🎩","🧢","👒","🎓","⛑️","🪖","👑","💍","👝","👛","👜","💼","🎒","🧳","👓","🕶️","🥽","🌂"
// "🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐻‍❄️","🐨","🐯","🦁","🐮","🐷","🐽","🐸","🐵","🙈","🙉","🙊","🐒","🐔","🐧","🐦","🐤","🐣","🐥","🦆","🦅","🦉","🦇","🐺","🐗","🐴","🦄","🐝","🪱","🐛","🦋","🐌","🐞","🐜","🪰","🪲","🪳","🦟","🦗","🕷️","🕸️","🦂","🐢","🐍","🦎","🦖","🦕","🐙","🦑","🦐","🦞","🦀","🐡","🐠","🐟","🐬","🐳","🐋","🦈","🦭","🐊","🐅","🐆","🦓","🦍","🦧","🦣","🐘","🦛","🦏","🐪","🐫","🦒","🦘","🦬","🐃","🐂","🐄","🐎","🐖","🐏","🐑","🦙","🐐","🦌","🐕","🐩","🦮","🐕‍🦺","🐈","🐈‍⬛","🪶","🐓","🦃","🦤","🦚","🦜","🦢","🦩","🕊️","🐇","🦝","🦨","🦡","🦫","🦦","🦥","🐁","🐀","🐿️","🦔","🐾","🐉","🐲","🌵","🎄","🌲","🌳","🌴","🪵","🌱","🌿","☘️","🍀","🎍","🪴","🎋","🍃","🍂","🍁","🪺","🪹","🍄","🐚","🪸","🪨","🌾","💐","🌷","🌹","🥀","🪷","🌺","🌸","🌼","🌻","🌞","🌝","🌛","🌜","🌚","🌕","🌖","🌗","🌘","🌑","🌒","🌓","🌔","🌙","🌎","🌍","🌏","🪐","💫","⭐","🌟","✨","⚡","☄️","💥","🔥","🌪️","🌈","☀️","🌤️","⛅","🌥️","☁️","🌦️","🌧️","⛈️","🌩️","🌨️","❄️","☃️","⛄","🌬️","💨","💧","💦","🫧","☔","☂️","🌊","🌫️"
// "🍏","🍎","🍐","🍊","🍋","🍌","🍉","🍇","🍓","🫐","🍈","🍒","🍑","🥭","🍍","🥥","🥝","🍅","🍆","🥑","🥦","🥬","🥒","🌶️","🫑","🌽","🥕","🫒","🧄","🧅","🥔","🍠","🥐","🥯","🍞","🥖","🥨","🧀","🥚","🍳","🧈","🥞","🧇","🥓","🥩","🍗","🍖","🦴","🌭","🍔","🍟","🍕","🫓","🥪","🥙","🧆","🌮","🌯","🫔","🥗","🥘","🫕","🥫","🫙","🍝","🍜","🍲","🍛","🍣","🍱","🥟","🦪","🍤","🍙","🍚","🍘","🍥","🥠","🥮","🍢","🍡","🍧","🍨","🍦","🥧","🧁","🍰","🎂","🍮","🍭","🍬","🍫","🍿","🍩","🍪","🌰","🥜","🫘","🍯","🥛","🫗","🍼","🫖","☕","🍵","🧃","🥤","🧋","🍶","🍺","🍻","🥂","🍷","🥃","🍸","🍹","🧉","🍾","🧊","🥄","🍴","🍽️","🥣","🥡","🥢","🧂"
// "⚽","🏀","🏈","⚾","🥎","🎾","🏐","🏉","🥏","🎱","🪀","🏓","🏸","🏒","🏑","🥍","🏏","🪃","🥅","⛳","🪁","🛝","🏹","🎣","🤿","🥊","🥋","🎽","🛹","🛼","🛷","⛸️","🥌","🎿","⛷️","🏂","🪂","🏋️‍♀️","🏋️","🏋️‍♂️","🤼‍♀️","🤼‍♂️","🤸‍♀️","🤸","🤸‍♂️","⛹️‍♀️","⛹️","⛹️‍♂️","🤺","🤾‍♀️","🤾","🤾‍♂️","🏌️‍♀️","🏌️","🏌️‍♂️","🏇","🧘‍♀️","🧘","🧘‍♂️","🏄‍♀️","🏄","🏄‍♂️","🏊‍♀️","🏊","🏊‍♂️","🤽‍♀️","🤽","🤽‍♂️","🚣‍♀️","🚣","🚣‍♂️","🧗‍♀️","🧗","🧗‍♂️","🚵‍♀️","🚵","🚵‍♂️","🚴‍♀️","🚴","🚴‍♂️","🏆","🥇","🥈","🥉","🏅","🎖️","🏵️","🎗️","🎫","🎟️","🎪","🤹‍♀️","🤹","🤹‍♂️","🎭","🩰","🎨","🎬","🎤","🎧","🎼","🎹","🥁","🪘","🎷","🎺","🪗","🎸","🪕","🎻","🎲","♟️","🎯","🎳","🎮","🎰","🧩"
// "🚗","🚕","🚙","🚌","🚎","🏎️","🚓","🚑","🚒","🚐","🛻","🚚","🚛","🚜","🦯","🦽","🦼","🩼","🛴","🚲","🛵","🏍️","🛺","🛞","🚨","🚔","🚍","🚘","🚖","🚡","🚠","🚟","🚃","🚋","🚞","🚝","🚄","🚅","🚈","🚂","🚆","🚇","🚊","🚉","✈️","🛫","🛬","🛩️","💺","🛰️","🚀","🛸","🚁","🛶","⛵","🚤","🛥️","🛳️","⛴️","🚢","🛟","⚓","🪝","⛽","🚧","🚦","🚥","🚏","🗺️","🗿","🗽","🗼","🏰","🏯","🏟️","🎡","🎢","🎠","⛲","⛱️","🏖️","🏝️","🏜️","🌋","⛰️","🏔️","🗻","🏕️","⛺","🛖","🏠","🏡","🏘️","🏚️","🏗️","🏭","🏢","🏬","🏣","🏤","🏥","🏦","🏨","🏪","🏫","🏩","💒","🏛️","⛪","🕌","🕍","🛕","🕋","⛩️","🛤️","🛣️","🗾","🎑","🏞️","🌅","🌄","🌠","🎇","🎆","🌇","🌆","🏙️","🌃","🌌","🌉","🌁"
// "⌚","📱","📲","💻","⌨️","🖥️","🖨️","🖱️","🖲️","🕹️","🗜️","💽","💾","💿","📀","📼","📷","📸","📹","🎥","📽️","🎞️","📞","☎️","📟","📠","📺","📻","🎙️","🎚️","🎛️","🧭","⏱️","⏲️","⏰","🕰️","⌛","⏳","📡","🔋","🪫","🔌","💡","🔦","🕯️","🪔","🧯","🛢️","💸","💵","💴","💶","💷","🪙","💰","💳","🪪","💎","⚖️","🪜","🧰","🪛","🔧","🔨","⚒️","🛠️","⛏️","🪚","🔩","⚙️","🪤","🧱","⛓️","🧲","🔫","💣","🧨","🪓","🔪","🗡️","⚔️","🛡️","🚬","⚰️","🪦","⚱️","🏺","🔮","📿","🧿","🪬","💈","⚗️","🔭","🔬","🕳️","🩻","🩹","🩺","💊","💉","🩸","🧬","🦠","🧫","🧪","🌡️","🧹","🪠","🧺","🧻","🚽","🚰","🚿","🛁","🛀","🧼","🪥","🪒","🧽","🪣","🧴","🛎️","🔑","🗝️","🚪","🪑","🛋️","🛏️","🛌","🧸","🪆","🖼️","🪞","🪟","🛍️","🛒","🎁","🎈","🎏","🎀","🪄","🪅","🎊","🎉","🎎","🏮","🎐","🪩","🧧","✉️","📩","📨","📧","💌","📥","📤","📦","🏷️","🪧","📪","📫","📬","📭","📮","📯","📜","📃","📄","📑","🧾","📊","📈","📉","🗒️","🗓️","📆","📅","🗑️","📇","🗃️","🗳️","🗄️","📋","📁","📂","🗂️","🗞️","📰","📓","📔","📒","📕","📗","📘","📙","📚","📖","🔖","🧷","🔗","📎","🖇️","📐","📏","🧮","📌","📍","✂️","🖊️","🖋️","✒️","🖌️","🖍️","📝","✏️","🔍","🔎","🔏","🔐","🔒","🔓"
// "❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❤️‍🔥","❤️‍🩹","❣️","💕","💞","💓","💗","💖","💘","💝","💟","☮️","✝️","☪️","🕉️","☸️","✡️","🔯","🕎","☯️","☦️","🛐","⛎","♈","♉","♊","♋","♌","♍","♎","♏","♐","♑","♒","♓","🆔","⚛️","🉑","☢️","☣️","📴","📳","🈶","🈚","🈸","🈺","🈷️","✴️","🆚","💮","🉐","㊙️","㊗️","🈴","🈵","🈹","🈲","🅰️","🅱️","🆎","🆑","🅾️","🆘","❌","⭕","🛑","⛔","📛","🚫","💯","💢","♨️","🚷","🚯","🚳","🚱","🔞","📵","🚭","❗","❕","❓","❔","‼️","⁉️","🔅","🔆","〽️","⚠️","🚸","🔱","⚜️","🔰","♻️","✅","🈯","💹","❇️","✳️","❎","🌐","💠","Ⓜ️","🌀","💤","🏧","🚾","♿","🅿️","🛗","🈳","🈂️","🛂","🛃","🛄","🛅","🚹","🚺","🚼","⚧️","🚻","🚮","🎦","📶","🈁","🔣","ℹ️","🔤","🔡","🔠","🆖","🆗","🆙","🆒","🆕","🆓","0️⃣","1️⃣","2️⃣","3️⃣","4️⃣","5️⃣","6️⃣","7️⃣","8️⃣","9️⃣","🔟","🔢","#️⃣","*️⃣","⏏️","▶️","⏸️","⏯️","⏹️","⏺️","⏭️","⏮️","⏩","⏪","⏫","⏬","◀️","🔼","🔽","➡️","⬅️","⬆️","⬇️","↗️","↘️","↙️","↖️","↕️","↔️","↪️","↩️","⤴️","⤵️","🔀","🔁","🔂","🔄","🔃","🎵","🎶","➕","➖","➗","✖️","🟰","♾️","💲","💱","™️","©️","®️","👁️‍🗨️","🔚","🔙","🔛","🔝","🔜","〰️","➰","➿","✔️","☑️","🔘","🔴","🟠","🟡","🟢","🔵","🟣","⚫","⚪","🟤","🔺","🔻","🔸","🔹","🔶","🔷","🔳","🔲","▪️","▫️","◾","◽","◼️","◻️","🟥","🟧","🟨","🟩","🟦","🟪","⬛","⬜","🟫","🔈","🔇","🔉","🔊","🔔","🔕","📣","📢","💬","💭","🗯️","♠️","♣️","♥️","♦️","🃏","🎴","🀄","🕐","🕑","🕒","🕓","🕔","🕕","🕖","🕗","🕘","🕙","🕚","🕛","🕜","🕝","🕞","🕟","🕠","🕡","🕢","🕣","🕤","🕥","🕦","🕧"],FLAGS:["🏳️","🏴","🏴‍☠️","🏁","🚩","🏳️‍🌈","🏳️‍⚧️","🇺🇳","🇦🇫","🇦🇽","🇦🇱","🇩🇿","🇦🇸","🇦🇩","🇦🇴","🇦🇮","🇦🇶","🇦🇬","🇦🇷","🇦🇲","🇦🇼","🇦🇺","🇦🇹","🇦🇿","🇧🇸","🇧🇭","🇧🇩","🇧🇧","🇧🇾","🇧🇪","🇧🇿","🇧🇯","🇧🇲","🇧🇹","🇧🇴","🇧🇦","🇧🇼","🇧🇷","🇻🇬","🇧🇳","🇧🇬","🇧🇫","🇧🇮","🇰🇭","🇨🇲","🇨🇦","🇮🇨","🇨🇻","🇧🇶","🇰🇾","🇨🇫","🇹🇩","🇮🇴","🇨🇱","🇨🇳","🇨🇽","🇨🇨","🇨🇴","🇰🇲","🇨🇬","🇨🇩","🇨🇰","🇨🇷","🇨🇮","🇭🇷","🇨🇺","🇨🇼","🇨🇾","🇨🇿","🇩🇰","🇩🇯","🇩🇲","🇩🇴","🇪🇨","🇪🇬","🇸🇻","🇬🇶","🇪🇷","🇪🇪","🇸🇿","🇪🇹","🇪🇺","🇫🇰","🇫🇴","🇫🇯","🇫🇮","🇫🇷","🇬🇫","🇵🇫","🇹🇫","🇬🇦","🇬🇲","🇬🇪","🇩🇪","🇬🇭","🇬🇮","🇬🇷","🇬🇱","🇬🇩","🇬🇵","🇬🇺","🇬🇹","🇬🇬","🇬🇳","🇬🇼","🇬🇾","🇭🇹","🇭🇳","🇭🇰","🇭🇺","🇮🇸","🇮🇳","🇮🇩","🇮🇷","🇮🇶","🇮🇪","🇮🇲","🇮🇱","🇮🇹","🇯🇲","🇯🇵","🎌","🇯🇪","🇯🇴","🇰🇿","🇰🇪","🇰🇮","🇽🇰","🇰🇼","🇰🇬","🇱🇦","🇱🇻","🇱🇧","🇱🇸","🇱🇷","🇱🇾","🇱🇮","🇱🇹","🇱🇺","🇲🇴","🇲🇬","🇲🇼","🇲🇾","🇲🇻","🇲🇱","🇲🇹","🇲🇭","🇲🇶","🇲🇷","🇲🇺","🇾🇹","🇲🇽","🇫🇲","🇲🇩","🇲🇨","🇲🇳","🇲🇪","🇲🇸","🇲🇦","🇲🇿","🇲🇲","🇳🇦","🇳🇷","🇳🇵","🇳🇱","🇳🇨","🇳🇿","🇳🇮","🇳🇪","🇳🇬","🇳🇺","🇳🇫","🇰🇵","🇲🇰","🇲🇵","🇳🇴","🇴🇲","🇵🇰","🇵🇼","🇵🇸","🇵🇦","🇵🇬","🇵🇾","🇵🇪","🇵🇭","🇵🇳","🇵🇱","🇵🇹","🇵🇷","🇶🇦","🇷🇪","🇷🇴","🇷🇺","🇷🇼","🇼🇸","🇸🇲","🇸🇹","🇸🇦","🇸🇳","🇷🇸","🇸🇨","🇸🇱","🇸🇬","🇸🇽","🇸🇰","🇸🇮","🇬🇸","🇸🇧","🇸🇴","🇿🇦","🇰🇷","🇸🇸","🇪🇸","🇱🇰","🇧🇱","🇸🇭","🇰🇳","🇱🇨","🇵🇲","🇻🇨","🇸🇩","🇸🇷","🇸🇪","🇨🇭","🇸🇾","🇹🇼","🇹🇯","🇹🇿","🇹🇭","🇹🇱","🇹🇬","🇹🇰","🇹🇴","🇹🇹","🇹🇳","🇹🇷","🇹🇲","🇹🇨","🇹🇻","🇻🇮","🇺🇬","🇺🇦","🇦🇪","🇬🇧","🏴󠁧󠁢󠁥󠁮󠁧󠁿","🏴󠁧󠁢󠁳󠁣󠁴󠁿","🏴󠁧󠁢󠁷󠁬󠁳󠁿","🇺🇸","🇺🇾","🇺🇿","🇻🇺","🇻🇦","🇻🇪","🇻🇳","🇼🇫","🇪🇭","🇾🇪","🇿🇲","🇿🇼"


const emojis: Array<string> = ['😀', '😁', '😂', '😃', '😄', '😅', '😆', '😉', '😊', '😋', '😌', '😍', '😏', '😒', '😓', '😔', '😖', '😘', '😚', '😜', '😝', '😞', '😠', '😡', '😢', '😣', '😤', '😥', '😨', '😩', '😪', '😫', '😭', '😰', '😱', '😲', '😳', '😵', '😷', '😸', '😹', '😺', '😻', '😼', '😽', '😾', '😿', '🙀', '🙅', '🙆', '🙇', '🙈', '🙉', '🙊', '🙋', '🙌', '🙍', '🙎', '🙏', '🚀', '🚃', '🚄', '🚅', '🚇', '🚉', '🚌', '🚏', '🚑', '🚒', '🚓', '🚕', '🚗', '🚙', '🚚', '🚢', '🚤', '🚥', '🚧', '🚨', '🚩', '🚪', '🚫', '🚬', '🚭', '🚲', '🚶', '🚹', '🚺', '🚻', '🚼', '🚽', '🚾', '🛀', '🅰', '🅱', '🅾', '🅿', '🆎', '🆑', '🆒', '🆓', '🆔', '🆕', '🆖', '🆗', '🆘', '🆙', '🆚', '🈁', '🈂', '🈚', '🈯', '🈲', '🈳', '🈴', '🈵', '🈶', '🈷', '🈸', '🈹', '🈺', '🉐', '🉑', '🀄', '🃏', '🌀', '🌁', '🌂', '🌃', '🌄', '🌅', '🌆', '🌇', '🌈', '🌉', '🌊', '🌋', '🌌', '🌏', '🌑', '🌓', '🌔', '🌕', '🌙', '🌛', '🌟', '🌠', '🌰', '🌱', '🌴', '🌵', '🌷', '🌸', '🌹', '🌺', '🌻', '🌼', '🌽', '🌾', '🌿', '🍀', '🍁', '🍂', '🍃', '🍄', '🍅', '🍆', '🍇', '🍈', '🍉', '🍊', '🍌', '🍍', '🍎', '🍏', '🍑', '🍒', '🍓', '🍔', '🍕', '🍖', '🍗', '🍘', '🍙', '🍚', '🍛', '🍜', '🍝', '🍞', '🍟', '🍠', '🍡', '🍢', '🍣', '🍤', '🍥', '🍦', '🍧', '🍨', '🍩', '🍪', '🍫', '🍬', '🍭', '🍮', '🍯', '🍰', '🍱', '🍲', '🍳', '🍴', '🍵', '🍶', '🍷', '🍸', '🍹', '🍺', '🍻', '🎀', '🎁', '🎂', '🎃', '🎄', '🎅', '🎆', '🎇', '🎈', '🎉', '🎊', '🎋', '🎌', '🎍', '🎎', '🎏', '🎐', '🎑', '🎒', '🎓', '🎠', '🎡', '🎢', '🎣', '🎤', '🎥', '🎦', '🎧', '🎨', '🎩', '🎪', '🎫', '🎬', '🎭', '🎮', '🎯', '🎰', '🎱', '🎲', '🎳', '🎴', '🎵', '🎶', '🎷', '🎸', '🎹', '🎺', '🎻', '🎼', '🎽', '🎾', '🎿', '🏀', '🏁', '🏂', '🏃', '🏄', '🏆', '🏈', '🏊', '🏠', '🏡', '🏢', '🏣', '🏥', '🏦', '🏧', '🏨', '🏩', '🏪', '🏫', '🏬', '🏭', '🏮', '🏯', '🏰', '🐌', '🐍', '🐎', '🐑', '🐒', '🐔', '🐗', '🐘', '🐙', '🐚', '🐛', '🐜', '🐝', '🐞', '🐟', '🐠', '🐡', '🐢', '🐣', '🐤', '🐥', '🐦', '🐧', '🐨', '🐩', '🐫', '🐬', '🐭', '🐮', '🐯', '🐰', '🐱', '🐲', '🐳', '🐴', '🐵', '🐶', '🐷', '🐸', '🐹', '🐺', '🐻', '🐼', '🐽', '🐾', '👀', '👂', '👃', '👄', '👅', '👆', '👇', '👈', '👉', '👊', '👋', '👌', '👍', '👎', '👏', '👐', '👑', '👒', '👓', '👔', '👕', '👖', '👗', '👘', '👙', '👚', '👛', '👜', '👝', '👞', '👟', '👠', '👡', '👢', '👣', '👤', '👦', '👧', '👨', '👩', '👪', '👫', '👮', '👯', '👰', '👱', '👲', '👳', '👴', '👵', '👶', '👷', '👸', '👹', '👺', '👻', '👼', '👽', '👾', '👿', '💀', '💁', '💂', '💃', '💄', '💅', '💆', '💇', '💈', '💉', '💊', '💋', '💌', '💍', '💎', '💏', '💐', '💑', '💒', '💓', '💔', '💕', '💖', '💗', '💘', '💙', '💚', '💛', '💜', '💝', '💞', '💟', '💠', '💡', '💢', '💣', '💤', '💥', '💦', '💧', '💨', '💩', '💪', '💫', '💬', '💮', '💯', '💰', '💱', '💲', '💳', '💴', '💵', '💸', '💹', '💺', '💻', '💼', '💽', '💾', '💿', '📀', '📁', '📂', '📃', '📄', '📅', '📆', '📇', '📈', '📉', '📊', '📋', '📌', '📍', '📎', '📏', '📐', '📑', '📒', '📓', '📔', '📕', '📖', '📗', '📘', '📙', '📚', '📛', '📜', '📝', '📞', '📟', '📠', '📡', '📢', '📣', '📤', '📥', '📦', '📧', '📨', '📩', '📪', '📫', '📮', '📰', '📱', '📲', '📳', '📴', '📶', '📷', '📹', '📺', '📻', '📼', '🔃', '🔊', '🔋', '🔌', '🔍', '🔎', '🔏', '🔐', '🔑', '🔒', '🔓', '🔔', '🔖', '🔗', '🔘', '🔙', '🔚', '🔛', '🔜', '🔝', '🔞', '🔟', '🔠', '🔡', '🔢', '🔣', '🔤', '🔥', '🔦', '🔧', '🔨', '🔩', '🔪', '🔫', '🔮', '🔯', '🔰', '🔱', '🔲', '🔳', '🔴', '🔵', '🔶', '🔷', '🔸', '🔹', '🔺', '🔻', '🔼', '🔽', '🕐', '🕑', '🕒', '🕓', '🕔', '🕕', '🕖', '🕗', '🕘', '🕙', '🕚', '🕛', '🗻', '🗼', '🗽', '🗾', '🗿', '😀', '😇', '😈', '😎', '😐', '😑', '😕', '😗', '😙', '😛', '😟', '😦', '😧', '😬', '😮', '😯', '😴', '😶', '🚁', '🚂', '🚆', '🚈', '🚊', '🚍', '🚎', '🚐', '🚔', '🚖', '🚘', '🚛', '🚜', '🚝', '🚞', '🚟', '🚠', '🚡', '🚣', '🚦', '🚮', '🚯', '🚰', '🚱', '🚳', '🚴', '🚵', '🚷', '🚸', '🚿', '🛁', '🛂', '🛃', '🛄', '🛅', '🌍', '🌎', '🌐', '🌒', '🌖', '🌗', '🌘', '🌚', '🌜', '🌝', '🌞', '🌲', '🌳', '🍋', '🍐', '🍼', '🏇', '🏉', '🏤', '🐀', '🐁', '🐂', '🐃', '🐄', '🐅', '🐆', '🐇', '🐈', '🐉', '🐊', '🐋', '🐏', '🐐', '🐓', '🐕', '🐖', '🐪', '👥', '👬', '👭', '💭', '💶', '💷', '📬', '📭', '📯', '📵', '🔀', '🔁', '🔂', '🔄', '🔅', '🔆', '🔇', '🔉', '🔕', '🔬', '🔭', '🕜', '🕝', '🕞', '🕟', '🕠', '🕡', '🕢', '🕣', '🕤', '🕥', '🕦', '🕧'];
const boldRegex = /((?:^|[\s\W_]))\*([^\s\u20e3]|[^\s\u20e3][^\n]*?\S)\*((?=$|[[\s\W_]))/sg;
const italicRegex = /((?:^|\s|_|[^\w\\]))_(\S|\S[^\n]*?\S)_((?=$|[[\s\W_]))/isg;
const strikeRegex = /((?:^|[\s\W_]))~([^\s\u20e3]|[^\s\u20e3][^\n]*?\S)~((?=$|[[\s\W_]))/isg;
const monoRegex = /```([\s\S]*?\S[\s\S]*?)```/img;
const urlRegex = /((https?:\/\/)?(www\.|(?!www))[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|www\.[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|https?:\/\/(www\.|(?!www))[a-zA-Z0-9]+\.[^\s]{2,}|www\.[a-zA-Z0-9]+\.[^\s]{2,})/isg;
const variableRegex = /\{([\w\s]+?)\}/usg;
const spintaxRegex = /\[([\S\s\p{sc=Cyrillic}|]+?)\]/usg;
const wordRegex = /[\\*\\_\\~\w\p{sc=Cyrillic}]/usi;
const whitespacesRegex = /\s{2,}/usg;

// https://codepen.io/brianmearns/pen/YVjZWw

class MessageEditor extends InputControl<HTMLTextAreaElement | HTMLInputElement> {
	private _apiForRandomizer: string | null = null;
	private _editorElem: HTMLElement | null = null;
	private _emojisListElem: HTMLElement | null = null;
	private _previewElem: HTMLElement | null = null;
	private _undoElem: HTMLElement | null = null;
	private _redoElem: HTMLElement | null = null;
	private _counterElem: HTMLElement | null = null;
	private _isRenderEmojis: boolean = false;
	private _symbolCounterTimer: number = 0;
	readonly disableLines: boolean = false;
	readonly maxLength: number;

	private readonly _hideClick: (e: MouseEvent) => void;

	get typeName(): string { return "BrandUp.MessageEditor" }

	constructor(inputElem: HTMLTextAreaElement | HTMLInputElement) {
		super(inputElem);

		this._hideClick = (e: MouseEvent) => {
			const t = e.target as HTMLElement;
			if (t.closest(".message-editor"))
				return;

			this.element?.classList.remove("open-emoji");
			document.removeEventListener("click", this._hideClick);
		};

		this.disableLines = inputElem.hasAttribute("data-disable-lines");
		this._apiForRandomizer = inputElem.getAttribute('data-randomizer-api');

		this.maxLength = inputElem.maxLength;
		inputElem.removeAttribute("maxlength");

		this._uiRender();
		this._initCommands();
		this._initEditor();
		this._restoreValue();
	}

	private _uiRender() {
		const randomizerButton = DOM.tag("button", { type: "button", command: "randomize", title: "Рандомизация текста" }, [randomizationIcon, DOM.tag("span", null, "рандомизация")]);

		if (!this._apiForRandomizer) {
			randomizerButton.classList.add("randomizer-hidden");
		}

		const container = DOM.tag("div", { class: "message-editor" }, [
			DOM.tag("div", { class: 'modal-emoji' }, [
				this._emojisListElem = DOM.tag("ul", { tabindex: 0 }, [DOM.tag("li", { class: "header" }, "Выберите смайлик, который хотите вставить в текст сообщения:")]),
				DOM.tag("div", { class: "close" }, [
					DOM.tag("button", { type: "button", class: "app-button secondary", command: "close-emodji", title: "Вернуться к сообщению" }, "Отмена"),
				])
			]),
			DOM.tag("div", { class: "scroll-content" }, [
				DOM.tag("div", { class: "editor" }, [
					this._editorElem = DOM.tag("div", { class: "writer", contenteditable: true }),
					DOM.tag("div", { class: "placeholder", command: "start-edit" }, this.__valueElem.placeholder),
					this._counterElem = DOM.tag("div", { class: "counter" }, "0")
				]),
				DOM.tag("div", { class: 'toolbar' }, [
					DOM.tag("button", { type: "button", command: "open-emodji", title: "Вставить смайлик" }, [emodjiHappyIcon]),
					DOM.tag("button", { type: "button", command: "close-emodji", title: "Вернуться к сообщению" }, [closeIcon, DOM.tag("span", null, "вернуться к сообщению")]),
					DOM.tag("button", { type: "button", command: "bold", title: "Выделить жирным" }, formatBoldIcon),
					DOM.tag("button", { type: "button", command: "italic", title: "Сделать курсивом" }, formatItalicIcon),
					DOM.tag("button", { type: "button", command: "strikethrough", title: "Сделать зачёркнутым" }, formatStrikethroughIcon),
					DOM.tag("button", { type: "button", command: "erase", title: "Очистить форматирование" }, formatEraserIcon),
					DOM.tag("div", { class: "split" }),
					this._undoElem = DOM.tag("button", { type: "button", command: "undo", title: "Отмена" }, undoIcon),
					this._redoElem = DOM.tag("button", { type: "button", command: "redo", title: "Повтор" }, redoIcon),
					DOM.tag("div", { class: "split" }),
					randomizerButton
				]),
				this._previewElem = DOM.tag("div", { class: "preview" })
			])
		]);

		this._uiRenderEmojis();
		this.setElement(container);

		this.__valueElem.setAttribute("tabindex", "-1");
		this.__valueElem.insertAdjacentElement("afterend", container);
		container.insertAdjacentElement("afterbegin", this.__valueElem);
		this.__valueElem.classList.add("output");
	}

	private _uiRenderEmojis() {
		if (this._isRenderEmojis)
			return;
		this._isRenderEmojis = true;

		const fragment = document.createDocumentFragment();
		emojis.forEach((emoji) => fragment.appendChild(DOM.tag("li", { tabindex: "0" }, emoji)));
		this._emojisListElem?.appendChild(fragment);

		this._emojisListElem?.addEventListener("mousedown", (e) => {
			const target = e.target as HTMLElement;
			if (target.tagName !== "LI")
				return;

			this._pasteEmoji(target.innerText);
		});

		this._emojisListElem?.addEventListener("keyup", (e: KeyboardEvent) => {
			if (e.keyCode == 27) {
				// escape
				this._closeEmoji();
				return;
			}

			const target = e.target as HTMLElement;
			if (e.keyCode == 13 && target.tagName === "LI") {
				// enter
				this._pasteEmoji(target.innerText);
			}
		});
	}

	private _uiRefreshUndoRedo() {
		if (document.queryCommandEnabled("undo"))
			this._undoElem?.removeAttribute('disabled');
		else
			this._undoElem?.setAttribute('disabled', 'disabled');

		if (document.queryCommandEnabled("redo"))
			this._redoElem?.removeAttribute('disabled');
		else
			this._redoElem?.setAttribute('disabled', 'disabled');
	}

	private _initCommands() {
		this.registerCommand("start-edit", () => this._editorElem?.focus());

		this.registerCommand("open-emodji", () => this._openEmoji());
		this.registerCommand("close-emodji", () => this._closeEmoji());

		this.registerCommand("bold", () => this._formatContent(FormatType.Bold));
		this.registerCommand("italic", () => this._formatContent(FormatType.Italic));
		this.registerCommand("strikethrough", () => this._formatContent(FormatType.Strike));
		this.registerCommand("monowidth", () => this._formatContent(FormatType.MonoWidth));

		this.registerCommand("erase", () => {
			let content = this._editorElem?.innerText.trim();

			if (!content) return;

			// bold
			content = content.replace(boldRegex, "$1$2$3");
			// italic
			content = content.replace(italicRegex, "$1$2$3");
			// strikethrough
			content = content.replace(strikeRegex, "$1$2$3");
			// monowidth
			content = content.replace(monoRegex, "$1");

			let selection = this.__getSelection();

			if (!selection || !this._editorElem) return;
			selection.selectAllChildren(this._editorElem);

			document.execCommand('insertText', false, content.trim());

			this._editorElem?.focus();
		});

		this.registerCommand('undo', () => {
			document.execCommand('undo', false);
			this._editorElem?.focus();
		});

		this.registerCommand('redo', () => {
			document.execCommand('redo', false);
			this._editorElem?.focus();
		});

		this.registerCommand('randomize', async context => {
			if (!this.element)
				return;

			this._editorElem?.focus();

			let selection = this.__getSelection();

			this._correctSpintaxSelection(selection);

			let range = selection.getRangeAt(0);
			let rangeContent = range.cloneContents();
			var content = rangeContent.textContent?.trim() || "";
			if (content.indexOf('\n') != -1)
				return;

			const t = await import('./randomizer')

			if (!this._apiForRandomizer) return;

			const randomizer = new t.default(this.element, this._apiForRandomizer, content, (text) => {
				this._editorElem?.focus();
				selection = this.__getSelection();
				selection.removeAllRanges();
				selection.addRange(range);
				document.execCommand("insertText", false, text);
			}, () => {
				this._editorElem?.focus();
				selection = this.__getSelection();
				selection.removeAllRanges();
				selection.addRange(range);

				selection.setPosition(selection?.focusNode, selection?.focusOffset);
			});

			this.onDestroy(() => randomizer.destroy());
		});
	}

	private _initEditor() {
		this._editorElem?.addEventListener("keydown", (e: KeyboardEvent) => {
			if (this.disableLines && (e.key == 'U+000A' || e.key == 'Enter' || e.keyCode == 13)) {
				e.preventDefault();
				return false;
			}
		});

		this._editorElem?.addEventListener("paste", (e) => {
			e.preventDefault();
			const pastedData = e.clipboardData?.getData('text/plain');
			if (pastedData) {
				let insertText: string;
				if (this.disableLines) {
					const lines = pastedData.split(/\n/);
					const output = lines.map((line) => {
						return line.trim();
					});
					insertText = output.join(' ');
				}
				else {
					const lines = pastedData.split(/\n/);
					const output = lines.map((line) => {
						line = line.trim();
						if (!line)
							line = "<br/>";
						return `<div>${line}</div>`;
					});
					insertText = output.join('');
				}

				insertText = insertText.replace(whitespacesRegex, (r) => {
					let result = '';
					for (let i = 0; i < r.length - 1; i++)
						result += '&nbsp;';
					return result + " ";
				});

				document.execCommand('insertHtml', false, insertText);
			}
		});

		this._editorElem?.addEventListener("focus", () => {
			this.element?.classList.add("focused");
		});

		this._editorElem?.addEventListener("blur", () => {
			this.element?.classList.remove("focused");
		});

		this._editorElem?.addEventListener('input', () => {
			this.element?.classList.remove('invalid');
			this._updateValue();

			clearTimeout(this._symbolCounterTimer);
			this._symbolCounterTimer = window.setTimeout(() => {
				this._refreshCounter(this.__valueElem.value);
			}, 200);

			this._uiRefreshUndoRedo();
		});

		this._uiRefreshUndoRedo();
	}

	private _openEmoji() {
		this.element?.classList.add("open-emoji");

		document.addEventListener("click", this._hideClick);

		this._emojisListElem?.focus();
	}

	private _closeEmoji() {
		this.element?.classList.remove("open-emoji");

		document.removeEventListener("click", this._hideClick);

		this._editorElem?.focus();
	}

	private _pasteEmoji(emojiSymbol: string) {
		this.element?.classList.remove("open-emoji");

		this._editorElem?.focus();
		document.execCommand('insertText', false, emojiSymbol);

		setTimeout(() => { this._editorElem?.focus(); }, 50);
	}

	private __getSelection() {
		let selection = window.getSelection();
		if (!selection) throw new Error("window selection is undefined");
		return selection;
	}

	private __getNodeValue(node: Node) {
		let nodeValue = node.nodeValue;
		if (nodeValue === undefined)
			throw new Error("nodeValue is undefined");
		return nodeValue ?? "";
	}

	private _formatContent(formatType: FormatType) {
		if (!this._editorElem || this._editorElem.innerText === "") return;

		this._editorElem?.focus();

		let selection = this.__getSelection();
		this._correctSelection(selection);

		var leftFormat = formatType;
		var rightFormat = formatType;

		let range = selection.getRangeAt(0);
		let rangeContent = range.cloneContents();
		var content = rangeContent.textContent?.trim() || "";
		if (content.indexOf('\n') != -1)
			return;

		switch (formatType) {
			case FormatType.Bold:
				content = content.replace(boldRegex, "$1$2$3");
				break;
			case FormatType.Italic:
				content = content.replace(italicRegex, "$1$2$3");
				break;
			case FormatType.Strike:
				content = content.replace(strikeRegex, "$1$2$3");
				break;
			case FormatType.MonoWidth:
				content = content.replace(monoRegex, "$1");
				break;
			default:
				throw "Неподдерживаемый тип форматирования.";
		}

		var text = `${leftFormat}${content}${rightFormat}`;

		document.execCommand("insertText", false, text);

		range = selection.getRangeAt(0);

		selection.setPosition(range.endContainer, range.endOffset ? range.endOffset - 1 : 0);
	}

	private _correctSelection(selection: Selection) {
		var node = selection.anchorNode;
		if (!node || !node.nodeValue) throw "selection node is undefined";

		var focusNode = selection.focusNode;
		if (!focusNode) throw "selection focusNode is undefined";

		if (selection.anchorNode !== focusNode)
			focusNode = node;

		var anchorOffset = selection.anchorOffset;
		var focusOffset = selection.focusOffset;

		if (anchorOffset > focusOffset) {
			focusOffset = anchorOffset;
			anchorOffset = selection.focusOffset;
		}

		anchorOffset = this._correctOffsetLeft(node, anchorOffset, focusOffset);
		if (focusOffset < anchorOffset)
			focusOffset = anchorOffset;
		focusOffset = this._correctOffsetRight(node, focusOffset, anchorOffset);

		if (anchorOffset != focusOffset && node.nodeType === Node.TEXT_NODE) {
			let text = this.__getNodeValue(node).substr(anchorOffset, focusOffset - anchorOffset);

			if (text.indexOf("[") !== -1 && text.lastIndexOf("]") === -1) {
				// Если выделение на левой границе spintax выражения, то нужно выделить до правой границы выражения

				focusOffset = focusOffset + node.nodeValue.substr(focusOffset).indexOf("]") + 1;
			}
			else if (text.lastIndexOf("]") > 1 && text.indexOf("[") === -1) {
				// Если выделение на правой границе spintax выражения, то нужно выделить до левой границы выражения

				anchorOffset = this.__getNodeValue(node).substr(0, anchorOffset).indexOf("[");
			}
			else { // if (text.indexOf("|") > 0 && text.indexOf("[") === -1 && text.indexOf("]") === -1)
				// Если внутри конструкции выделения есть вертикальная линия рандомизации.

				let prevText = this.__getNodeValue(node).substr(0, anchorOffset);
				let nextText = this.__getNodeValue(node).substr(focusOffset);

				if (prevText.lastIndexOf("[") !== -1 && nextText.indexOf("]") !== -1) {
					// Если снаружи есть разметка рандомизации.

					anchorOffset = prevText.lastIndexOf("[");
					focusOffset = focusOffset + nextText.indexOf("]") + 1;
				}
			}
		}

		selection.setBaseAndExtent(node, anchorOffset, focusNode, focusOffset);
	}

	private _correctOffsetLeft(node: Node, offset: number, maxOffset: number): number {
		if (node.nodeType == Node.TEXT_NODE) {
			let text = this.__getNodeValue(node);

			let isCorrected = false
			if (offset < text.length - 1) {
				for (let i = offset; i < maxOffset; i++) {
					let s = text.substr(i, 1);
					if (wordRegex.test(s)) {
						if (i > offset) {
							offset = i;
							isCorrected = true;
						}
						break;
					}
				}
			}

			if (!isCorrected) {
				if (offset > 0) {
					for (offset; offset > 0; offset--) {
						let s = text.substr(offset - 1, 1);
						if (!wordRegex.test(s))
							break;
					}
				}
			}
		}
		else if (node.nodeType == Node.ELEMENT_NODE)
			throw new Error("По элементам не ходим пока что.");
		else
			throw new Error("Недопустимый тип ноды.");

		return offset;
	}

	private _correctOffsetRight(node: Node, offset: number, minOffset: number): number {
		if (node.nodeType == Node.TEXT_NODE) {
			const text = this.__getNodeValue(node);
			if (offset == text.length)
				return offset;

			let isCorrected = false;
			if (offset > 0) {
				for (let i = offset - 1; i > minOffset; i--) {
					let s = text.substr(i, 1);
					if (wordRegex.test(s)) {
						if (i < offset - 1) {
							offset = i + 1;
							isCorrected = true;
						}
						break;
					}
				}
			}

			if (!isCorrected) {
				if (offset < text.length) {
					for (offset; offset < text.length; offset++) {
						let s = text.substr(offset, 1);
						if (!wordRegex.test(s))
							break;
					}
				}
			}
		}
		else if (node.nodeType == Node.ELEMENT_NODE)
			throw new Error("По элементам не ходим пока что.");
		else
			throw new Error("Недопустимый тип ноды.");

		return offset;
	}

	private _correctSpintaxSelection(selection: Selection) {
		var node = selection.anchorNode;
		var focusNode = selection.focusNode;
		if (!node || this.__getNodeValue(node) === null || !focusNode)
			return; // Чтобы дальше не было ошибки. Так как скорее всего в selection пустой элемент.

		if (selection.anchorNode !== focusNode)
			focusNode = node;

		var anchorOffset = selection.anchorOffset;
		var focusOffset = selection.focusOffset;

		if (anchorOffset > focusOffset) {
			focusOffset = anchorOffset;
			anchorOffset = selection.focusOffset;
		}

		if (anchorOffset === focusOffset) {
			// Получаем левую и правую часть ноды относительно курсора
			let getLeftSideWord = this.__getNodeValue(node).substr(0, anchorOffset);
			let getRightSideWord = this.__getNodeValue(node).substr(focusOffset, this.__getNodeValue(node).length);
			// Получаем пробелы по краям из полученного слова и убираем отступы
			let findLeftSpace = getLeftSideWord.split(' ').slice(-1);
			let findRightSpace = getRightSideWord.split(' ').slice(0, 1);
			// Получаем позицию начала и конца слова
			anchorOffset = anchorOffset - findLeftSpace[0].length;
			focusOffset = focusOffset + findRightSpace[0].length;
		}

		anchorOffset = this._correctSpintaxOffsetLeft(node, anchorOffset, focusOffset);
		if (focusOffset < anchorOffset)
			focusOffset = anchorOffset;
		focusOffset = this._correctSpintaxOffsetRight(node, focusOffset, anchorOffset);

		if (anchorOffset != focusOffset && node.nodeType === Node.TEXT_NODE) {
			let text = this.__getNodeValue(node).substr(anchorOffset, focusOffset - anchorOffset);

			let startIndex = text.indexOf("[");
			let endIndex = text.lastIndexOf("]");
			if (startIndex >= 0 || (endIndex !== -1 && endIndex <= text.length - 1)) {
				let index = startIndex;
				if (index > 0) {
					anchorOffset = anchorOffset + index;
					text = this.__getNodeValue(node).substr(anchorOffset, focusOffset - anchorOffset);
				}

				endIndex = text.lastIndexOf("]");
				if (endIndex < text.length - 1) {
					focusOffset = anchorOffset + endIndex + 1;
				}
			}

			text = this.__getNodeValue(node).substr(anchorOffset, focusOffset - anchorOffset);
			startIndex = text.indexOf("[");
			endIndex = text.lastIndexOf("]");
			if (startIndex === 0 && endIndex === text.length - 1) {
				text = text.substr(1, text.length - 2);
				if (text.indexOf("]") > 0) {
					focusOffset = anchorOffset + text.indexOf("]") + 2;
				}
			}
		}

		selection.setBaseAndExtent(node, anchorOffset, focusNode, focusOffset);
	}

	private _correctSpintaxOffsetLeft(node: Node, offset: number, maxOffset: number): number {
		if (node.nodeType == Node.TEXT_NODE) {
			let text = this.__getNodeValue(node);
			let isCorrected = false
			if (offset < text.length - 1) {
				for (let i = offset; i < maxOffset; i++) {
					let s = text.substr(i, 1);
					if (wordRegex.test(s)) {
						if (i > offset) {
							offset = i;
							isCorrected = true;
						}
						break;
					}
				}
			}

			if (!isCorrected) {
				if (offset > 0) {
					for (offset; offset > 0; offset--) {
						let s = text.substr(offset - 1, 1);
						if (!wordRegex.test(s))
							break;
					}
				}
			}

			if (offset > 0) {
				let leftText = text.substr(0, offset);
				let i = leftText.lastIndexOf("[");
				let i2 = leftText.substr(i).indexOf("]");
				if (i !== -1 && i2 === -1)
					offset = i;
			}
		}
		else if (node.nodeType == Node.ELEMENT_NODE) {
			//throw "По элементам не ходим пока что.";
			return offset;
		}
		else
			throw "Недопустимый тип ноды.";

		return offset;
	}

	private _correctSpintaxOffsetRight(node: Node, offset: number, minOffset: number): number {
		if (node.nodeType == Node.TEXT_NODE) {
			let text = this.__getNodeValue(node);
			if (offset == text.length)
				return offset;

			let isCorrected = false;
			if (offset > 0) {
				for (let i = offset - 1; i > minOffset; i--) {
					let s = text.substr(i, 1);
					if (wordRegex.test(s)) {
						if (i < offset - 1) {
							offset = i + 1;
							isCorrected = true;
						}
						break;
					}
				}
			}

			if (!isCorrected) {
				if (offset < text.length) {
					for (offset; offset < text.length; offset++) {
						let s = text.substr(offset, 1);
						if (!wordRegex.test(s))
							break;
					}
				}
			}

			if (offset < text.length - 1) {
				let rightText = text.substr(offset);
				let i = rightText.indexOf("]");
				let i2 = rightText.substr(0, i + 1).indexOf("[");
				if (i !== -1 && i2 === -1)
					offset = offset + i + 1;
			}
		}
		else if (node.nodeType == Node.ELEMENT_NODE)
			//throw new Error("По элементам не ходим пока что.");
			return offset;
		else
			throw new Error("Недопустимый тип ноды.");

		return offset;
	}

	private _restoreValue() {
		var value = this.__valueElem.value;
		if (this.disableLines) {
			const lines = value.split(/\n/);
			const output = lines.map((line) => line.trim());
			value = output.join(' ');
		}

		if (this._editorElem)
			this._editorElem.innerText = value;
		this._refreshPreview(value);
		this._refreshCounter(value);
	}

	private _updateValue() {
		if (!this._editorElem) return;

		const textSegments = this._getTextSegments(this._editorElem);

		//console.log(textSegments);

		let textContent = '';
		textSegments.forEach((item, index) => {
			if (item.break && index > 0) {
				textContent += '\r\n';
				return;
			}

			if (!item.break)
				textContent += item.text;
		});

		textContent = textContent.trim();

		this.__valueElem.value = textContent;

		this._refreshPreview(textContent);
	}

	private _getTextSegments(element: Node, isParentParagraph: boolean = false): Array<{ text: string | null, node: Node, break: boolean, tag: string | null }> {
		const textSegments: Array<{ text: string | null, node: Node, break: boolean, tag: string | null }> = [];
		Array.from(element.childNodes).forEach((node, index, nodes) => {
			switch (node.nodeType) {
				case Node.TEXT_NODE: {
					let trimmedValue = this.__getNodeValue(node).trim();
					if (trimmedValue)
						textSegments.push({ text: trimmedValue, node, break: false, tag: null });

					isParentParagraph = false;

					if (nodes.length - 1 == index && (element.nodeName === "DIV" || element.nodeName === "P")) {
						textSegments.push({ text: null, node: element, break: true, tag: element.nodeName });
					}

					break;
				}
				case Node.ELEMENT_NODE: {
					var isParagraph = node.nodeName === "DIV" || node.nodeName === "P";
					var isBr = node.nodeName === "BR";

					if ((!isParentParagraph && isParagraph) || isBr)
						textSegments.push({ text: null, node: node, break: true, tag: node.nodeName });

					if (!isBr) {
						const childSegments = this._getTextSegments(node, isParagraph);
						textSegments.splice(textSegments.length, 0, ...(childSegments));
					}

					if (isParagraph)
						isParentParagraph = true;

					break;
				}
				default:
					throw new Error(`Unexpected node type: ${node.nodeType}`);
			}
		});

		return textSegments;
	}

	private _refreshPreview(textContent: string) {
		if (this._previewElem)
			if (textContent)
				this._previewElem.innerHTML = this._highlightText(textContent);
			else {
				DOM.empty(this._previewElem);
				this._previewElem.insertAdjacentElement("afterbegin", DOM.tag("span", { class: "empty" }, "Предпросмотр текста сообщения"));
			}
	}

	private _highlightText(text: string) {
		text = text.replace(boldRegex, '$1<b>$2</b>$3');
		text = text.replace(italicRegex, '$1<i>$2</i>$3');
		text = text.replace(strikeRegex, '$1<s>$2</s>$3');
		text = text.replace(monoRegex, '<code>$1</code>');
		text = text.replace(urlRegex, (substr: string) => {
			var url = substr;
			if (!url.startsWith("http"))
				url = "http://" + url;
			return `<a href="${url}" target="_blank">${substr}</a>`;
		});
		text = text.replace(variableRegex, (_, ...s: Array<string>) => {
			let v = s[0].trim();
			if (!v)
				return s[0];
			return `<span class="variable" title="Инструкция персонализации">${v.toUpperCase()}</span>`;
		});
		text = text.replace(spintaxRegex, (_, ...s: Array<string>) => {
			var values = s[0].split("|");
			return `<span class="spintax" title="Инструкция рандомизации">${values[0]}</span>`;
		});

		const words = text.split(/\n/);
		const output = words.map((line) => {
			line = line.trim();
			if (!line)
				line = "<br />";
			return `<div>${line}</div>`;
		});
		return output.join('');
	}

	private _refreshCounter(text: string) {
		if (!this._counterElem) return;
		var textLength = this._calculateSymbolsCount(text);
		var countText = textLength ? `${textLength} ${WordHelper.getWordEnd(textLength, "символ", "", "а", "ов")}` : "";

		if (this.maxLength > 0) {
			if (textLength > this.maxLength) {
				countText = `${textLength} / ${this.maxLength}`;

				this._counterElem?.classList.add("error");
			}
			else
				this._counterElem?.classList.remove("error");
		}

		this._counterElem.innerText = countText;
	}

	private _calculateSymbolsCount(text: string): number {
		// bold
		text = text.replace(boldRegex, "$1$2$3");
		// italic
		text = text.replace(italicRegex, "$1$2$3");
		// strikethrough
		text = text.replace(strikeRegex, "$1$2$3");
		// monowidth
		text = text.replace(monoRegex, "$1");

		text = text.replace(spintaxRegex, (_, ...s: Array<string>) => {
			var values = s[0].split("|");
			return values.sort((a, b) => b.length - a.length)[0];
		});

		return text.length;
	}

	focus() {
		super.focus();

		this._editorElem?.focus();
	}

	validate(): boolean {
		if (!this.element)
			return false;

		const isValid = super.validate();

		if (!isValid)
			this.element.classList.add("invalid");
		else
			this.element.classList.remove("invalid");

		return isValid;
	}

	destroy() {
		clearTimeout(this._symbolCounterTimer);

		this.element?.remove();
		this.__valueElem.classList.remove("output");
		this.__valueElem.removeAttribute("tabindex");

		super.destroy();
	}
}

enum FormatType {
	Bold = '*',
	Italic = '_',
	Strike = '~',
	MonoWidth = '```'
}

export default MessageEditor;