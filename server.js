/* internal modules */
const http = require('http');
const fs = require('fs');

/* external modules */
const qs = require('query-string');
const mongodb = require('mongodb');
const cookies = require('cookies');
const uuid = require('uuid');
const WebSocket = require('ws');

/* own modules */
const lib = require('./lib');
const common = require('./common');
const rest = require('./rest');

/* configuration */
let config = {};
try {
    const content = fs.readFileSync('config.json');
    config = JSON.parse(content);
} catch(ex) {
    console.error(ex.message);
    process.exit(1);
}

/* HTTP server */
const httpServer = http.createServer();

httpServer.on('request', function (req, rep) {
    const appCookies = new cookies(req, rep);
    let session = appCookies.get('session');
    const now = Date.now();
    if(!session || !common.sessions[session]) {
        session = uuid();
        common.sessions[session] = { from: req.connection.remoteAddress, created: now, touched: now };
    } else {
        common.sessions[session].from = req.connection.remoteAddress;
        common.sessions[session].touched = now;    
    }
    appCookies.set('session', session, { httpOnly: false });

    console.log('<<< ' + req.method + ' ' + req.url + ' [' + session + ']');

    const parsedUrl = qs.parseUrl(req.url);
    if(req.method == 'POST' || req.method == 'PUT') {
        /* requests with payload will be redirected to rest */
        lib.payload2JSON(req, rep, function(req, rep, payload, err) {
            if(err) {
                lib.sendJSONWithError(rep, 400, err.text);
            } else {
                rest(parsedUrl.url, req, rep, parsedUrl.query, payload, session);
            }
        });
        return;
    }

    switch(parsedUrl.url) {
        /* static content server */
        case '/':
            lib.serveStaticContent(rep, 'html/index.html'); break;
        default:
            /* file server */
            if(/^\/(html|css|js|fonts|img)\//.test(parsedUrl.url)) {
                lib.serveStaticContent(rep, '.' + parsedUrl.url);
            } else {
                /* not static content, try rest without payload */
                rest(parsedUrl.url, req, rep, parsedUrl.query, null, session);
            }
    }

});

common.ws = new WebSocket.Server({ server: httpServer });

common.ws.on('connection', function connection(conn) {
	conn.on('message', function(data) {
        console.log('<<< retrieving data from websocket: ' + data);
        try {
            const message = JSON.parse(data);
            switch(message.action) {
                case 'init':
                    if(message.session && common.sessions[message.session]) {
                        console.log('Session ids consistent, websocket initialization for session ' + message.session);
                        common.sessions[message.session].ws = conn;
                        conn.session = message.session;
                    }
                    break;
                default:
                    console.log('Unknown action sent from websocket: ' + message.action);
            }
        } catch(ex) {
            console.log('Invalid message from websocket: ' + data);
        }
	}); 
});

mongodb.MongoClient.connect(config.db, { useNewUrlParser: true, useUnifiedTopology: true }, async (err, conn) =>
{
    if(err) {
        console.error('Connection to ' + config.db + ' failed: ' + err.name);
        process.exit(2);
    }
    const db = conn.db(config.dbName);

    common.accounts = db.collection('accounts');
    common.accounts.createIndex({username: 1}, {name: 'username', unique: true});

    common.messages = db.collection('messages');

    const exampleUsernames = ['2hotPersonal', 'Aislelyra', 'AlertChiri', 'Animelb', 'Aprilli', 'Articlem', 'Ategravi', 'Beambuxo', 'BlackSan', 'Borgelan', 'Brainymobi', 'Broadcate', 'BuddieVibrant', 'Bulgalt', 'BulletinRavager', 'Burnover', 'Captaine', 'Changs', 'ChanPsych', 'CookieStart', 'Cooperi', 'Crunchea', 'CuteBloom', 'CzarAngelic', 'Devexigat', 'Donaldeh', 'Eastner', 'Eatseu', 'Eugenestp', 'Facultr', 'Fulterom', 'FunnySimply', 'GatoHappy', 'GazetteWizard', 'Goodiati', 'Hartstli', 'HeavenEye', 'Hinchan', 'Hortoney', 'Hyposia', 'InformerBlab', 'InspiringThink', 'Jumpsiary', 'Kixon', 'Langdonic', 'Laxray', 'LuckyJide', 'Lummopo', 'Lyfert', 'Manshi', 'Mastersugg', 'Mclobb', 'Mellowne', 'Melneti', 'Mercybe', 'Minetp', 'Modesina', 'Mohawkeroo', 'Nayborld', 'Nofferis', 'NotJim', 'Nozymeds', 'Patrmer', 'Ploughlog', 'PodPeatear', 'Proladelc', 'Publivv', 'Rapti', 'Reneurop', 'Repleon', 'Roachetta', 'Sandhew', 'Scensink', 'ScorpionBigg', 'SharkWin', 'Signerer', 'SlayerRay', 'SlayStory', 'Spection', 'Stargaltica', 'Stewarm', 'Succent', 'Suppindo', 'Synchroni', 'Tabst', 'Talendla', 'Talenterc', 'Telarics', 'Tenthwarc', 'Theborgista', 'Thesoyones', 'Thinkwo', 'TrippinDj', 'Valanelvi', 'Wasabi2cool', 'Wercadab', 'Whiternet', 'Withanics', 'Wondeller', 'WubbaPapa'];

    if(100 > await common.accounts.countDocuments()) {
        console.log('Generating example accounts');

        await Promise.all(new Array(100).fill(0).map(() => {
            const exampleAccount = {
                email: `${uuid().substr(0, 10)}@example.com`,
                username: `${
                    exampleUsernames[(Math.random()*exampleUsernames.length)|0]
                }${(Math.random()*100)|0}`,
                password: '1234'
            };
            return common.accounts.insertOne(exampleAccount);
        })).catch(console.error);
    }

    console.log('Connection with ' + config.db + ' established');
    httpServer.listen(config.port);
    console.log("HTTP server is listening on the port " + config.port);
});
