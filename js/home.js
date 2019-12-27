app.controller("Home", ['$http', 'globals', function($http, globals) {
    this.searchUsername = '';
    this.searching = false;
    this.foundUsers = [];
    this.favorites = [];
    
    /** @type {Chat[]} */
    this.openChats = [];

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

    this.openChat = user => {
        if( this.isChatOpen(user) )//if user's chat is already open
            return;
        this.openChats.push( new Chat(user, this) );
    };

    this.closeChat = chat => {
        this.openChats = this.openChats.filter(_chat => _chat !== chat);
    };

    this.isChatOpen = user => this.openChats.some(chat => chat.user._id === user._id);

    //temp
    this.searchUsers();
}]);