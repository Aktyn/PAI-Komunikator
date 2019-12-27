const app = angular.module("app", ['ngSanitize', 'ngRoute', 'ngAnimate', 'ngWebSocket', 'ui.bootstrap', 'nvd3']);

// zmienne globalne
app.value('globals', {
    email: null,
    username: null
});

// nowe podstrony i ich kontrolery
app.constant('routes', [
	{ route: '/', templateUrl: '/html/home.html', controller: 'Home', controllerAs: 'ctrl', guest: true } 
]);

app.config(['$routeProvider', '$locationProvider', 'routes', function($routeProvider, $locationProvider, routes) {
    $locationProvider.hashPrefix('');
	for(const i in routes) {
		$routeProvider.when(routes[i].route, routes[i]);
	}
	$routeProvider.otherwise({ redirectTo: '/' });
}]);

app.controller("loginDialog", [ '$http', '$uibModalInstance', function($http, $uibModalInstance) {
    const ctrl = this;
    // devel: dla szybszego logowania
    ctrl.creds = { email: 'example@email.com', password: '12345', username: 'Aktyn' };
    ctrl.loginError = null;

    ctrl.registerView = false;
    ctrl.toggleRegisterView = show => ctrl.registerView = show;

    function handleLogin(email, username) {
        $uibModalInstance.close({email, username});
    }

    ctrl.tryRegister = () => {
        $http.post('/register', ctrl.creds).then(rep => {
            handleLogin(rep.data.email, rep.data.username);
            ctrl.registerView = false;
        }, err => {
            if(err.data.error === 'Account already exists')
                ctrl.loginError = 'Takie konto już istnieje';
            else
                ctrl.loginError = 'Wystąpił błąd podczas rejestracji konta';
        });
    };

    ctrl.tryLogin = () => {
        $http.post('/login', ctrl.creds).then(rep => {
            handleLogin(rep.data.email, rep.data.username);
        }, err => {
            ctrl.loginError = 'Niepoprawny email lub hasło';
        });
    };

    ctrl.cancel = function() {
        $uibModalInstance.dismiss('cancel');
    };

}]);

app.controller('Menu', ['$http', '$rootScope', '$scope', '$location', '$uibModal', '$websocket', 'routes', 'globals', 'common',
	function($http, $rootScope, $scope, $location, $uibModal, $websocket, routes, globals, common) {
        const ctrl = this;
        
        ctrl.username = null;
        ctrl.alert = common.alert;

        const refresh = function() {
            ctrl.username = globals.username;
        };

        $http.get('/login').then(rep => {
            globals.email = rep.data.email;
            globals.username = rep.data.username;
            refresh();

            try {
                const dataStream = $websocket('ws://' + window.location.host);
                dataStream.onMessage(rep => {
                    try {
                        $rootScope.$broadcast('chatMessage', rep.data);
                    } catch(error) {
                        console.error('Data from websocket cannot be parsed: ' + rep.data);
                    }
                });
                dataStream.send(JSON.stringify({action: 'init', session: rep.data.session}));
            } catch(error) {
                console.error('Initialization of websocket communication failed');
            }
        }, err => { 
            globals.email = null; 
            globals.username = null;
        });

        ctrl.isCollapsed = true;

        $scope.$on('$routeChangeSuccess', function () {
            ctrl.isCollapsed = true;
        });

		ctrl.navClass = function(page) {
			return page === $location.path() ? 'active' : '';
		}

        ctrl.login = function() {
            if(globals.email && globals.username) {//if user is logged in
                common.confirm({ title: `Witaj ${globals.username}`, body: 'Czy na pewno chcesz się wylogować?' }, function(answer) {
                    if(answer) {    
                        $http.delete('/login').then(rep => {
                            globals.email = globals.username = null;
                            refresh();
                            $location.path('/');
                        }, err => {});
                    }
                });    
            } else {
                const modalInstance = $uibModal.open({
                    animation: true,
                    ariaLabelledBy: 'modal-title-top',
                    ariaDescribedBy: 'modal-body-top',
                    templateUrl: '/html/loginDialog.html',
                    controller: 'loginDialog',
                    controllerAs: 'ctrl'
                });
                modalInstance.result.then(
                    function(data) {
                        globals.email = data.email;
                        globals.username = data.username;
                        refresh();
                        $location.path('/');
                    });
            }
        };

        ctrl.closeAlert = function() { ctrl.alert.text = ""; };
}]);

app.service('common', ['$uibModal', 'globals', function($uibModal, globals) {
    this.confirm = function(confirmOptions, callback) {
        const modalInstance = $uibModal.open({
            animation: true,
            ariaLabelledBy: 'modal-title-top',
            ariaDescribedBy: 'modal-body-top',
            templateUrl: '/html/confirm.html',
            controller: 'Confirm',
            controllerAs: 'ctrl',
            resolve: {
                confirmOptions: function () {
                    return confirmOptions;
                }
            }
        });

        modalInstance.result.then(
            function () { callback(true); },
            function (ret) { callback(false); }
        );
    };

    this.alert = { text: '', type: '' };
    
    this.showMessage = function(msg) {
        this.alert.type = 'alert-success';
        this.alert.text = msg;
    };

    this.showError = function(msg) {
        this.alert.type = 'alert-danger';
        this.alert.text = msg;
    };

    this.stamp2date = function(stamp) {
        return new Date(stamp).toLocaleString();
    };
}]);