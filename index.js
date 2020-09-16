const fs = require('fs');
const lighthouse = require('lighthouse');
const chromeLauncher = require('chrome-launcher');
const lighthouseConfig = require('./lighthouse-config.js');

const getConfig = () => {
    try {
        return JSON.parse(fs.readFileSync("./config.json", "utf-8"));
    } catch (error) {
        console.error(error);
    }
}

const config = getConfig();

const websitesToAudit = config.urls.reduce((acc, url) => {
    return [...acc, ...new Array(config.numberOfAudits).fill(url.url)]
}, []);

const audits = [...websitesToAudit]

const reports = {};

const getNewValues = (values, value) => {
    return [...values || [], value];
};

const getNewAverage = (newValues) => {
    return newValues.reduce((acc, value) => acc + value, 0) / newValues.length;
};

const setDefaultReport = (urlWithSlashes) => {
    reports[urlWithSlashes] = reports[urlWithSlashes] || { numberOfTests: 0, scores: [], averageScore: 0, metrics: {
        'first-contentful-paint': {
            times: []
        },
        'speed-index': {
            times: []
        },
        'largest-contentful-paint': {
            times: []
        },
        'interactive': {
            times: []
        },
        'total-blocking-time': {
            times: []
        },
        'cumulative-layout-shift': {
            times: []
        }
    } }
}

const getMetrics = (auditRefs, urlWithSlashes, audits) => {
    return auditRefs.reduce((acc, auditRef) => {
        if (
            auditRef.group === 'metrics' && auditRef.weight > 0
        ) {
            const newValues = getNewValues(reports[urlWithSlashes].metrics[auditRef.id].times, audits[auditRef.id].numericValue);
            const newAverage = getNewAverage(newValues);

            acc = {
                ...acc,
                [auditRef.id]: {id: auditRef.id, weight: auditRef.weight, times: newValues, averageTime: newAverage, averageTimeInSeconds: (newAverage / 1000).toFixed(2) }
            }

        }
        return acc;
    }, {});
}

const runAudit = (async (url, folderPath) => {
    const timestamp = Date.now();
    const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless'] });
    const options = lighthouseConfig;
        
    const runnerResult = await lighthouse(url, { port: chrome.port }, options );

    // `.report` is the HTML report as a string
    const reportHtml = runnerResult.report;
    const urlWithUnderscores = runnerResult.lhr.finalUrl.split("https://")[1].split("/").join("_");
    const fileName = `lhreport-${urlWithUnderscores}-${timestamp}.html`;
    fs.writeFileSync(`${folderPath}/${fileName}`, reportHtml);

    const urlWithSlashes = urlWithUnderscores.split("_").join("/");
    setDefaultReport(urlWithSlashes);

    const score = runnerResult.lhr.categories.performance.score * 100;
    const scores = getNewValues(reports[urlWithSlashes].scores, score);
    const averageScore = getNewAverage(scores);
    const numberOfTests = scores.length;

    const metrics = getMetrics(
        runnerResult.lhr.categories.performance.auditRefs,
        urlWithSlashes,
        runnerResult.lhr.audits
    );

    reports[urlWithSlashes] = { 
        numberOfTests,
        scores,
        averageScore,
        metrics
    }

    // `.lhr` is the Lighthouse Result as a JS object
    console.log('Report is done for', runnerResult.lhr.finalUrl);

    return await chrome.kill();
})

const runAllAudits = (folderPath) => {
    const allAudits = audits.reduce((acc, url) => acc.then(() => runAudit(url, folderPath)), Promise.resolve());
    allAudits.then(() => { console.log(JSON.stringify(reports, null, 4) ); fs.writeFile(`${folderPath}/reportAsJSON-${folderPath.split("/")[2]}.json`, JSON.stringify(reports, null, 4), err => {
        if (err) {
            console.error(err);
            return;
        }
    }) });
};

const createReportsFolder = () => {
    const dir = './reports';
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
    }
};

const createFolderForCurrentReport = () => {
    const timestamp = Date.now();
    const dir = `./reports/${timestamp}`;
    fs.mkdirSync(dir);
    return dir;
};

const run = () => {
    createReportsFolder();
    const folderPathForCurrentReport = createFolderForCurrentReport();
    runAllAudits(folderPathForCurrentReport);
};

run();