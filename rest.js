/* external modules */
const mongodb = require('mongodb');

/* own modules */
const lib = require('./lib');
const common = require('./common');

module.exports = function(url, req, rep, query, payload, session) {
    console.log('REST handling ' + req.method + ' ' + url + ' query ' + JSON.stringify(query) + ' payload ' + JSON.stringify(payload) + ' session ' + session);

    function handleError(msg) {
        lib.sendJSONWithError(rep, 401, msg);
    }

    switch(url) {
        case '/message':
            if(!common.sessions[session].accountNo) {
                lib.sendJSONWithError(rep, 401, 'Session expired');
                return;
            }

            switch(req.method) {
                case 'GET':
                    lib.getChatHistory(
                        common.sessions[session].accountNo,
                        mongodb.ObjectID.createFromHexString(query.userId)
                    ).then(res => {
                        lib.sendJSON(rep, res);
                    }).catch(() => handleError('Database error'));

                    break;
                case 'POST':
                    if(!payload || !payload.user || !payload.message) {
                        lib.sendJSONWithError(rep, 401, 'Invalid credentials');
                        return;
                    }

                    const messageEntry = {
                        from: common.sessions[session].accountNo,
                        to: mongodb.ObjectID.createFromHexString(payload.user._id),
                        content: payload.message
                    };
                    
                    common.messages.insertOne(messageEntry).then(res => {
                        if(res.result.ok) {
                            lib.sendJSON(rep, {});

                            //sending new message over websocket
                            lib.sendDataToSession(session, JSON.stringify({
                                ...messageEntry,
                                _id: res.insertedId,
                                myMessage: true
                            }));
                            lib.sendDataToAccount(messageEntry.to, JSON.stringify({
                                ...messageEntry,
                                _id: res.insertedId,
                                myMessage: false,
                                fromUsername: common.sessions[session].username
                            }));
                        }
                        else
                            handleError('Cannot send message')
                    }).catch(() => handleError('Database error'));
                    break;
                case 'DELETE':
                    break;
                default:
                    lib.sendJSONWithError(rep, 400, 'Invalid method ' + req.method + ' for ' + url);
            }
            break;

        case '/searchUsers':
            if(req.method !== 'GET')
                return;
            
            lib.searchUsers(query.username).then(res => {
                lib.sendJSON(rep, res);
            }).catch(() => handleError('Error during users search'))
            break;

        case '/register':
            if(req.method !== 'POST')
                return;

            if(!payload || !payload.email || !payload.password || !payload.username) {
                handleError('Invalid credentials');
                return;
            }

            common.accounts.findOne({
                $or: [{username: payload.username}, {email: payload.email}]
            }).then(res => {
                if(res) {
                    handleError('Account already exists');
                    return;
                }

                const newAccount = {
                    email: payload.email,
                    username: payload.username,
                    password: payload.password,
                    favorites: []
                };

                //registering account
                common.accounts.insertOne(newAccount).then(insert_res => {
                    if( !insert_res.result.ok ) {
                        handleError('Cannot insert new account');
                        return;
                    }
                    
                    common.sessions[session].accountNo = insert_res.insertedId;
                    common.sessions[session].email = newAccount.email;
                    common.sessions[session].username = newAccount.username;
                    lib.sendJSON(rep, newAccount);
                }).catch(() => handleError('Database error'));
            }).catch(() => handleError('Database error'));
            break;

        case '/login':
            switch(req.method) {
                case 'GET':
                    const whoami = {
                        session: session,
                        accountNo: common.sessions[session].accountNo,
                        email: common.sessions[session].email,
                        username: common.sessions[session].username
                    };
                    lib.sendJSON(rep, whoami);
                    break;
                case 'POST':
                    if(!payload || !payload.password || !payload.username) {
                        lib.sendJSONWithError(rep, 401, 'Invalid credentials');
                        return;
                    }
                    common.accounts.findOne({
                        password: payload.password,
                        username: payload.username
                    }, {}, function(err, account) {
                        if(err || !account) {
                            lib.sendJSONWithError(rep, 401, 'Bad password');
                            return;
                        }
                        common.sessions[session].accountNo = account._id;
                        common.sessions[session].email = account.email;
                        common.sessions[session].username = account.username;
                        delete account.password;
                        lib.sendJSON(rep, account);
                    });
                    break;
                case 'DELETE':
                    delete common.sessions[session].accountNo;
                    delete common.sessions[session].email;
                    delete common.sessions[session].username;
                    lib.sendJSON(rep, { session: session });
                    break;
                default:
                    lib.sendJSONWithError(rep, 400, 'Invalid method ' + req.method + ' for ' + url);
            }
            break;

        case '/favorites':
            if(!common.sessions[session].accountNo) {
                lib.sendJSONWithError(rep, 401, 'Session expired');
                return;
            }

            function returnFavorites() {
                lib.getFavorites(common.sessions[session].accountNo).then(favorites => {
                    lib.sendJSON(rep, {favorites: favorites || []});
                }).catch(() => handleError('Database error'));
            }

            switch(req.method) {
                case 'GET':
                    lib.getFavorites(common.sessions[session].accountNo).then(favorites => {
                        lib.sendJSON(rep, {favorites: favorites || []});
                    }).catch(error => {
                        console.error(error);
                        handleError('Database error');
                    });
                    break;
                case 'POST':
                    common.accounts.updateOne({
                        _id: common.sessions[session].accountNo
                    }, {
                        $addToSet: {
                            favorites: mongodb.ObjectID.createFromHexString(payload.targetId)
                        }
                    }).then( returnFavorites() ).catch(() => handleError('Database error'));
                    break;
                case 'DELETE':
                    common.accounts.updateOne({
                        _id: common.sessions[session].accountNo
                    }, {
                        $pull: {
                            favorites: mongodb.ObjectID.createFromHexString(query.targetId)
                        }
                    }).then( returnFavorites ).catch(() => handleError('Database error'));
                    break;
                default:
                    lib.sendJSONWithError(rep, 400, 'Invalid method ' + req.method + ' for ' + url);
            }
            break;

        default:
            lib.sendJSONWithError(rep, 400, 'Invalid rest endpoint ' + url);
    }
};