var SERVICE_URI = "http://mansehrmoviesearch.appspot.com/mansehr_moviesearch";

var version = 2;
var DEBUG = false;
var sleepIterations = 0;

angular.module('MovieSearchApp', []).
controller('MovieSearchCtrl', function($scope, $http, $timeout) {
	
	if(DEBUG) {
		$scope.mode = 'dev';
	}
	
	showInfo("Laddar filmtjänster och senaste sökning");
	
	/**
	 * Initialize active supplier urls on pageload
	 */
	$timeout(function () {
		
		var delta = 0;
		$scope.lastAccess = localStorageLoad("mansehrSULastAccess");
		if ($scope.lastAccess !== undefined) {
			var laTime = new Date($scope.lastAccess);
			delta = (new Date().getTime() - laTime);
		}
		
		var urls = localStorageLoad("mansehrServiceUrls");
		if (urls == undefined || isNaN(delta) || delta > 1800000) {
			showInfo("Laddade filmtjänster från servern");
			localStorageClear();
			$http.get(SERVICE_URI+"?suppliers="+version)
				.success(
					function(data) {
						parseUrls(data, true);
						localStorageStore("mansehrServiceUrls", JSON
								.stringify($scope.supplierUrls));
						localStorageStore("mansehrSULastAccess",
								new Date());
						$scope.showForm = true;
					})
				.error(
					function(data, textStatus, error) {
						var err = textStatus + ', ' + error;
						console.log("Request Failed: " + err);
						showError("Anropet för att hämta filmtjänster misslyckades. Kontrollera att du är ansluten till internet.");
					});
		} else {
			showInfo("Laddade filmtjänster från cachen");
			// Load cache
			$scope.supplierUrls = JSON.parse(urls);
			$scope.showForm = true;
		}
		resetMessage();
	
		// Load last search
		$scope.movieName = localStorageLoad("movieSearchQry");
		if ($scope.movieName === undefined) {
			$scope.movieName = "";
		}

		var res = localStorageLoad("movieSearchResult");
		if (res !== undefined) {
			$scope.result = JSON.parse(res);
		} else {
			resetResult();
		}
		
		$scope.showFormFocus = true;
	}, 400);


	$scope.formSubmit = function() {
		if ($scope.supplierUrls.length == 0) {
			$scope.errMsg = 'Inga filmtjänster laddade. Kontrollera internetanslutning. ';
		}
		try {
			if ($scope.movieName != '') {
				$scope.showForm = false;
				
				localStorageStore("movieSearchQry", $scope.movieName);

				resetResult();

				searchSuppliers();

				waitUntilSearchDone();
			} else {
				showInfo("Ange en film att söka efter");
			}
		} catch (e) {
			debug("Request Failed: " + e);
			console.log("Request Failed: " + e);

			$scope.showForm = true;
		}
	};




/**
 * Loop until all searchsuppliers are done
 * 
 * @returns
 */
function waitUntilSearchDone() {
	// We search for max 10 sec, so the user dont have to wait to long
	if ($scope.result && $scope.result.good && $scope.result.good.length == 0 && ++sleepIterations < 20) {
		setTimeout(waitUntilSearchDone, 500);
		return;
	}
	sleepIterations = 0;
	$scope.$apply("showForm = true");
}

function resetResult() {
	$scope.result = {good: [], other: []};
}


function parseUrls(data, forceUse) {
	$scope.supplierUrls = {};
	angular.forEach(data, function(val, key) {
		var res = {
			id: val.supplierId,
			url : val.url,
			logoUrl : val.logoUrl,
			name : val.name,
			use: true,
			hits: {good: "*", tot: "*"}
		};
		$scope.supplierUrls[res.id] = res;
	});
}

$scope.updateLocalStore = function() {
	localStorageStore("mansehrServiceUrls", JSON.stringify($scope.supplierUrls));
}

function searchSuppliers() {
	$http.defaults.transformResponse = [];
	angular.forEach($scope.supplierUrls, function callSupplier(sup) {
		if(sup.use == false) {
			sup.hits = {good : '*', tot : '*'};
			return;
		}
		
		sup.hits = {good : 'R', tot : 'R'};
		
		$http.get(sup.url + $scope.movieName)
		.success(function(data) {
			callParserService(data, sup);
		})
		.error(function(data) {
			supplierError(data, sup);
		});
	});
}

function supplierError(error, supplier) {
	supplier.hits = {good : 'X', tot : 'X'};
	debug(supplier.id + ', Result error: '+error);
}

function callParserService(parseData, sup) {
	sup.hits.good = 'P';
	sup.hits.tot = 'P';
	
	$http.post(SERVICE_URI, 
		"supplier=" + encodeURIComponent(sup.id) +
		"&data=" + encodeURIComponent(parseData) +
		"&movieName=" + encodeURIComponent($scope.movieName),
		{headers: {'Content-Type': 'application/x-www-form-urlencoded'}}
	).success(function(data) {
		parseJsonResult(data, sup);
	}).error(function(data, textStatus, error) {
		var err = textStatus + ', ' + error;
		supplierError(err, sup);
	});
}

function parseJsonResult(xml, supplier) {
	supplier.hits = {good : 0, tot : 0};
	var json = JSON.parse(xml);
	if(json.goodMatchResult) {
		angular.forEach(json.goodMatchResult, function(val) {
			val.logoUrl = supplier.logoUrl;
			$scope.result.good.push(val);
			supplier.hits.good++;
			supplier.hits.tot++;
		});
	}

	if(json.otherResult) {
		angular.forEach(json.otherResult, function(val) {
			val.logoUrl = supplier.logoUrl;
			$scope.result.other.push(val);
			supplier.hits.tot++;
		});
	}
	
	localStorageStore("movieSearchResult", JSON.stringify($scope.result));
	$scope.updateLocalStore();
}

function localStorageLoad(id) {
	return localStorage.getItem(id);
}

function localStorageStore(id, data) {
	localStorage.setItem(id, data);
}

function localStorageClear() {
	localStorage.clear();
}

var messageTimer;
function showInfo(mess) {
	$scope.message = mess;
	$scope.errorMessage = false;
}

function showError(mess) {
	$scope.message = mess;
	$scope.errorMessage = true;
}

function resetMessage() {
	$scope.message = '';
	$scope.errorMessage = false;
}

$scope.debugMessage = 'DEV';
function debug(txt) {
	$scope.debugMessage += JSON.stringify(txt) + '\n';
}

}).directive('focusMe', function($timeout, $parse) {
  return {
	   link: function(scope, element, attrs) {
		   var model = $parse(attrs.focusMe);
		      scope.$watch(model, function(value) {
	        if(value === true) { 
		   $timeout(function() {
			   element[0].focus(); 
		   });
	        }
		      });
	   }
  	};
}).directive('msResultList', function() {
	return {
	scope: {items: '='}, 
	templateUrl: '/ms-result-list-item.html',
		
	link: function($scope, $element, $attrs) {
		$scope.title = $attrs['title'];
		$scope.orderby = $attrs['orderby'];
	}
	};
});