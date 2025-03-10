
const E = module.exports;

E.SEC = 1000;
E.MIN = 60*E.SEC;
E.HOUR = 60*E.MIN;
E.DAY = 24*E.HOUR;
E.WEEK = 7*E.DAY;
E.MONTH = 4*E.WEEK;
E.YEAR = 365*E.DAY;

E.formatDate = ms=>{
    const d = ms ? new Date(ms) : new Date();
    let month = '' + (d.getMonth() + 1);
    let day = '' + d.getDate();
    let year = d.getFullYear();
    if (month.length < 2) 
        month = '0' + month;
    if (day.length < 2) 
        day = '0' + day;
    return `${year}-${month}-${day}`;
}

E.formatTime = ms=>{
    const d = ms ? new Date(ms) : new Date();
    let hours = '' + d.getHours();
    let minutes = '' + d.getMinutes();
    let seconds = '' + d.getSeconds();
    if (hours.length < 2)
        hours = '0' + hours;
    if (minutes.length < 2)
        minutes = '0' + minutes;
    if (seconds.length < 2)
        seconds = '0' + seconds;
    return E.formatDate(+d)+` ${hours}:${minutes}:${seconds}`;
};

E.mstos = ms=>(ms/1000).toFixed(2);

E.startTimer = ()=>{
    const startTime = Date.now();
    return {stop: ()=>Date.now()-startTime};
};
