const { isFuture, parse } = require('date-fns');

const parseLenientDate = (dateStr) => {
    if (!dateStr) return null;
    const str = dateStr.trim();
    if (!str) return null;

    const formats = ['yyyy-MM-dd', 'dd-MMM-yyyy', 'M/d/yyyy', 'M-d-yyyy', 'MM/dd/yyyy', 'MM-dd-yyyy', 'd-M-yyyy', 'd/M/yyyy'];
    
    for (const fmt of formats) {
        const parsed = parse(str, fmt, new Date());
        if (!isNaN(parsed)) {
            if (parsed.getFullYear() < 2000) parsed.setFullYear(parsed.getFullYear() + 2000);
            return parsed;
        }
    }
    return null;
};

const parseLenientTime = (timeStr) => {
    if (!timeStr) return null;
    let str = timeStr.trim().toUpperCase();
    if (!str) return null;

    if (str.match(/\d[AP]M$/)) {
        str = str.replace(/([AP]M)$/, ' $1');
    }

    const formats = ['h:mm a', 'h:mm A', 'H:mm', 'HH:mm'];
    
    for (const fmt of formats) {
        const parsed = parse(str, fmt, new Date());
        if (!isNaN(parsed)) {
            return parsed;
        }
    }
    return null;
};

let pDate = parseLenientDate('08-Jul-2026');
let pTime = parseLenientTime('7:20 PM');
console.log('pDate:', pDate);
console.log('pTime:', pTime);

let parsedDate = new Date(pDate);
parsedDate.setHours(pTime.getHours(), pTime.getMinutes(), 0, 0);

console.log('parsedDate:', parsedDate);
console.log('isFuture:', isFuture(parsedDate));
