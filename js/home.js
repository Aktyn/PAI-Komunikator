app.controller("Home", ['$http', '$scope', 'globals', function($http, $scope, globals) {
    this.searchUsername = '';
    this.searching = false;
    this.foundUsers = [];
    this.favorites = [];
    
    /** @type {Chat[]} */
    this.openChats = [];
    this.notifications = [];

    window.onMessagesContainerScroll = event => {
        try {
            const chatId = parseInt( event.target.id.match(/chat_(\d+)$/)[1] );
            const chat = this.openChats.find(({id}) => id === chatId);
            if(chat)
                chat.onScroll();
        }
        catch(e) {
            console.error(e);
        }
    };

    $scope.$on('chatMessage', (event, arg) => { 
        const message = JSON.parse(arg);
        
        if(message.myMessage) {
            const chat = this.openChats.find(chat => chat.user._id === message.to);
            if(chat) {
                chat.pushMessage(message);
            }
        }
        else if(message.fromUsername) {
            const chat = this.openChats.find(chat => chat.user._id === message.from);
            if(chat) {
                chat.pushMessage(message);
            }
            else {
                if( !this.notifications.some(({from}) => from === message.from) ) {
                    this.notifications.push({
                        from: message.from,
                        content: `Nowa wiadomość od ${message.fromUsername}`,
                        fromUsername: message.fromUsername
                    });
                }
            }
        }
    });

    this.openNotification = ({from}) => {
        const notificationIndex = this.notifications.findIndex(n => n.from === from);
        if(notificationIndex === -1)
            return;

        this.openChat({
            _id: from,
            username: this.notifications[notificationIndex].fromUsername
        });
        
        this.notifications.splice(notificationIndex, 1);
    };

    this.canBeFavorite = ({_id}) => {
        return !this.favorites.some(favorite => favorite._id === _id);
    };

    this.searchUsers = () => {
        this.searching = true;

        $http.get(`/searchUsers?username=${this.searchUsername}`).then(rep => {
            this.foundUsers = rep.data.filter(({username}) => username !== globals.username);
            this.searching = false;
        }).catch(console.error);
    };

    this.addFavorite = ({_id}) => {
        $http.post('/favorites', {
            targetId: this.foundUsers.find(user => user._id === _id)._id
        }).then(rep => {
            this.favorites = rep.data.favorites;
        }).catch(console.error);
    };

    this.deleteFavorite = index => {
        $http.delete(`/favorites?targetId=${this.favorites[index]._id}`).then(rep => {
            this.favorites = rep.data.favorites;
        }).catch(console.error);
    };

    $http.get('/favorites').then(rep => {
        this.favorites = rep.data.favorites;
    }).catch(console.error);

    /** @param {{_id: string, username: string}} user */
    this.openChat = user => {
        if( this.isChatOpen(user) )//if user's chat is already open
            return;
        this.openChats.push( new Chat(user, this, $http, globals) );
    };

    this.closeChat = chat => {
        const chatIndex = this.openChats.indexOf(chat);
        if(chatIndex !== -1)
            this.openChats.splice(chatIndex, 1);
    };

    this.isChatOpen = user => this.openChats.some(chat => chat.user._id === user._id);

    this.sendMessage = (user, message) => {
        $http.post('/message', { user, message }).then(rep => {
            console.log(`Message "${message}" sent to ${user.username}`);
        }).catch(console.error);
    };

    //temp
    //this.searchUsers();
}]);