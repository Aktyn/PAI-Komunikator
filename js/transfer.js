app.controller("Transfer", [ '$http', '$scope', 'common', function($http, $scope, common) {
    var ctrl = this;
    
    ctrl.account = {};
    ctrl.emails = [];

    var initVars = function() {
        ctrl.transaction = { recipient: "", amount: "", description: "" };
    };

    initVars();

    var refreshAccount = function() {
        $http.get('/account').then(function (rep) {
            ctrl.account = rep.data;
        }, function(err) {});
    };

    refreshAccount();

    $http.get('/recipients').then(function(rep) {
        ctrl.emails = rep.data;
    }, function(err) {});

    ctrl.doTransfer = function() {
        $http.post('/account', ctrl.transaction).then(
            function (rep) {
                ctrl.account = rep.data;
                common.showMessage('Przelew udany');
                initVars();
            },
            function (err) {
                common.showError('Przelew nieudany, czy odbiorca jest poprawny?');
            }
        );
    };

    ctrl.formInvalid = function() {
        return ctrl.transaction.amount <= 0 || ctrl.account.balance - ctrl.transaction.amount < ctrl.account.limit;
    };

    $scope.$on('transfer', function(event, obj) {
        refreshAccount();
    });
}]);