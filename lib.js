/* internal modules */
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const mongodb = require('mongodb');

/* external modules */
const mime = require('mime');

/* own modules */
const common = require('./common');

/** @param {string} str */
function escapeRegExp(str) {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const lib = module.exports = {

    sendErrorOnStaticContent: function (response, code) {
        console.log('>>> sending error ' + code + ' page');
        response.writeHead(code, {'Content-Type': 'text/plain; charset=utf-8'});
        switch (code) {
            case 404:
                response.write('Error 404: file not found.');
                break;
            case 403:
                response.write('Error 403: access denied.');
                break;
            case 406:
                response.write('Error 406: not acceptable');
                break;
            default:
                response.write('Error ' + code);
        }
        response.end();
    },

    sendFile: function (response, filePath, fileContents) {
        var mimeType = mime.getType(path.basename(filePath));
        console.log('>>> sending file ' + filePath + ' ' + mimeType);
        response.writeHead(200, {'Content-Type': mimeType });
        response.end(fileContents);
    },

    serveStaticContent: function (response, absPath) {
        var n = absPath.indexOf('?');
        var fileName = absPath.substring(0, n != -1 ? n : absPath.length);
        fs.exists(fileName, function (exists) {
            if (exists) {
                fs.readFile(fileName, function (err, data) {
                    if (err) {
                        lib.sendErrorOnStaticContent(response, 406);
                    } else {
                        lib.sendFile(response, fileName, data);
                    }
                });
            } else {
                if(fileName.endsWith('.map')) {
                    console.log('>>> generating empty response for ' + absPath);
                    response.writeHead(200, {'Content-Type': 'application/octet-stream'});
                    response.end();
                } else {
                    lib.sendErrorOnStaticContent(response, 404);
                }
            }
        });
    },
    
    sendJSON: function(rep, op) {
        var repStr = JSON.stringify(op);
        console.log('>>> sending JSON ' + repStr);
        rep.writeHead(200, 'OK', { 'Content-type': 'application/json' });
        rep.end(repStr);
    },
    
    sendJSONWithError: function (response, code, text) {
        console.log('>>> sending JSON with error ' + code + ' \'' + text + '\'');
        response.writeHead(code, 'ERROR', { 'Content-type': 'application/json'});
        response.end(JSON.stringify({ error: text }));
    },
    
    payload2JSON: function(req, rep, callback) {
        req.setEncoding('utf8');
        var payload = '';
        req.on('data', function(data) {
            payload += data;
        }).on('end', function() {
            try {
                op = JSON.parse(payload);
                err = null;
            } catch(ex) {
                op = null;
                err = { text: "Payload is not a valid JSON" };
            }
            callback(req, rep, op, err);
        });
    },
    
    sendDataToSession: function(session, data) {
        try {
            console.log('Attempting to send data ' + data + ' to session ' + session);
            let n = 0, nAll = 0;
            common.ws.clients.forEach(function(client) {
                nAll++;
                if(client.session == session && client.readyState === WebSocket.OPEN) {
                    client.send(data);
                    n++;
                }
            });
            console.log('Sent to ' + n + ' from ' + nAll + ' clients');
        } catch(ex) {}
    },

    sendDataToAccount: function(_id, data) {
        try {
            console.log('Attempting to send data ' + data + ' to user ' + _id);
            let n = 0, nAll = 0;
            for(var session in common.sessions) {
                nAll++;
                if(_id.equals(common.sessions[session].accountNo) && common.sessions[session].ws && common.sessions[session].ws.readyState === WebSocket.OPEN) {
                    common.sessions[session].ws.send(data);
                    n++;
                }
            }
            console.log('Sent to ' + n + ' from ' + nAll + ' sessions');
        } catch(ex) {}
    },

    searchUsers: async (_username) => {
        const accounts = await common.accounts.aggregate([
            {
                $match: {
                    username: new RegExp(`.*${escapeRegExp(_username)}.*`, 'i')
                }
            }, {
                $limit: 64
            }, {
                $project: {
                    _id: 1,
                    username: 1
                }
            }
        ]).toArray();
        return accounts;
    },

    getFavorites: async (userId) => {
        const favorites = await common.accounts.aggregate([
            {
                $match: {
                    _id: userId
                }
            }, {
                $unwind: {
                    path: '$favorites',
                    preserveNullAndEmptyArrays: false
                }
            }, {
                $lookup: {
                    from: 'accounts',
                    localField: 'favorites',
                    foreignField: '_id',
                    as: 'favorite'
                }
            }, {
                $unwind: '$favorite'
            }, {
                $project: {
                    _id: 0,
                    favorite: 1
                }
            }, {
                $limit: 64
            }
        ]).toArray();
        
        return favorites.map(({favorite}) => {
            return {
                _id: favorite._id,
                username: favorite.username
            };
        });
    },

    /** 
     * @param {mongodb.ObjectID} selfId
     * @param {mongodb.ObjectID} userId
     */
    getChatHistory: async (selfId, userId) => {
        const messages = await common.messages.aggregate([
            {
                $match: {
                    $or: [
                        {
                            from: selfId,
                            to: userId
                        }, {
                            from: userId,
                            to: selfId
                        }
                    ]
                }
            }, {
                $project: {
                    from: 1,
                    content: 1
                }
            }, {
                $limit: 1024
            }
        ]).toArray();
        
        console.log(messages);
        return messages;
    }
};