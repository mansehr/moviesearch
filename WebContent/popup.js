var SERVICE_URI = "http://mansehrmoviesearch.appspot.com/mansehr_moviesearch";

var version = 2;
var DEBUG = false;
var sleepIterations = 0;

angular.module('MovieSearchApp', []).
controller('MovieSearchCtrl', function($scope) {
	
	if(DEBUG) {
		$scope.mode = 'dev';
	}
	
	/**
	 * Initialize active supplier urls on pageload
	 */
	function initSupplierURLs() {
		$scope.$apply(showInfo("Laddar filmtjänster"));
		
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
			$.getJSON(SERVICE_URI, {
					suppliers : version
				})
				.done(
					function(data) {
						parseUrls(data, true);
						localStorageStore("mansehrServiceUrls", JSON
								.stringify($scope.supplierUrls));
						localStorageStore("mansehrSULastAccess",
								new Date());
						$scope.$apply("showForm = true");
					})
				.fail(
					function(jqxhr, textStatus, error) {
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
	}
	
	function loadLastSearch() {
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
	}
	
	initSupplierURLs();

	// Load last search
	loadLastSearch();


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
	angular.forEach($scope.supplierUrls, function callSupplier(sup) {
		if(sup.use == false) {
			sup.hits = {good : '*', tot : '*'};
			return;
		}
		try {
			sup.hits = {good : 'R', tot : 'R'};
			
			var req = new XMLHttpRequest();
			req.open("GET", sup.url + $scope.movieName, true);
			req.onload = function(e) {
				callParserService(e, sup);
			};
			req.onerror = function(e) {
				supplierError(e, sup);
			};
			req.send(null);
		} catch (e) {
			supplierError(e, sup);
		}
	});
}

function supplierError(error, supplier) {
	supplier.hits = {good : 'X', tot : 'X'};
	debug(supplier.id + ', Result error: '+error);
}

function callParserService(e, sup) {
	sup.hits.good = 'P';
	sup.hits.tot = 'P';
	
	$.post(SERVICE_URI, {
		"supplier" : sup.id,
		"data" : e.target.responseText,
		"movieName" : $scope.movieName
	// - Gör ingen filtrering på servern
	}, 'json').done(function(data) {
		parseJsonResult(data, sup);
	}).fail(function(jqxhr, textStatus, error) {
		var err = textStatus + ', ' + error;
		supplierError(err, supplier);
	}).always(function() {
		debug('Callback: ' + sup.id);
		
	});
}

function parseJsonResult(xml, supplier) {
	var json = JSON.parse(xml);

	supplier.hits = {good : 0, tot : 0};
	
	if(json.goodMatchResult) {
		$.each(json.goodMatchResult, function(key, val) {
			val.logoUrl = supplier.logoUrl;
			$scope.result.good.push(val);
			supplier.hits.good++;
			supplier.hits.tot++;
		});
	}

	if(json.otherResult) {
		$.each(json.otherResult, function(key, val) {
			val.logoUrl = supplier.logoUrl;
			$scope.result.other.push(val);
			supplier.hits.tot++;
		});
	}
	
	localStorageStore("movieSearchResult", JSON.stringify($scope.result));
	$scope.updateLocalStore();

	$scope.$apply();
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

}).directive('focusMe', function() {
  return {
	   link: function(scope, element) {
	        element[0].focus(); 
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