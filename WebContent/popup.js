var SERVICE_URI = "http://pagediffer.appspot.com/mansehr_moviesearch";

var version = 1;
var DEBUG = false;
var sleepIterations = 0;
var supplierUrls = [];
var resultArray = [];
var movieName = '';

var data = new Object();

// Handler for .ready() called.
$(function() {

	initSupplierURLs();

	// Load last search
	loadLastSearch();

	resetSearch();

	$('#target').submit(function(form) {

		if (supplierUrls.length == 0) {
			$('#result').html('Inga filmtj&auml;nster laddade.');
		}
		try {
			movieName = $('#movie_name').val();
			if (movieName != '') {
				$('#form_result').hide();
				$('#result').text("Hittade inga filmer");
				$('#search_img').fadeIn();
				localStorage.setItem("movieSearchQry", movieName);

				resetResult();

				searchSuppliers();

				waitUntilSearchDone();

			} else {
				$('#result').html("Ange en film att s&ouml;ka efter");
			}
		} catch (e) {
			console.log("Request Failed: " + e);
		}
		form.preventDefault();
	});
});

function loadLastSearch() {
	var qry = localStorage.getItem("movieSearchQry");
	if (qry != undefined) {
		$('#movie_name').val(qry);
	}

	var res = localStorage.getItem("movieSearchResult");
	if (res != undefined) {
		resetResult();
		parseJsonResult(res);
	}
}

/**
 * Loop until all searchsuppliers are done
 * 
 * @returns
 */
function waitUntilSearchDone() {
	// We search for max 10 sec, so the user dont have to wait to long
	if (resultArray.length == 0 && ++sleepIterations < 20) {
		setTimeout(waitUntilSearchDone, 500);
		return;
	}
	resetSearch();
}

function resetSearch() {
	sleepIterations = 0;

	$('#search_img').hide();
	$('#form_result').show();
	$('#movie_name').focus();
	$("#infoTxt").css('display', 'inline').fadeOut(5000);
}

function resetResult() {
	data.goodMatchResult = [];
	data.otherResult = [];
}

/**
 * Parse the result from the parsing server
 */
function parseResult(data) {
	$('#result').text('');

	data.goodMatchResult.sort(function(a, b) {
		return a.price - b.price;
	});
	apendListToResult(data.goodMatchResult, 'Bra tr&auml;ffar:');

	data.otherResult.sort(function(a, b) {
		return a.movieName.toUpperCase().localeCompare(
				b.movieName.toUpperCase());
	});
	apendListToResult(data.otherResult, 'Andra tr&auml;ffar:');
	localStorage.setItem("movieSearchResult", JSON.stringify(data));
}

function apendListToResult(data, title) {
	var items = [];

	$.each(data, function(key, val) {
		items.push(parseItem(key, val));
	});
	if (items.length > 0) {
		$('<h2/>', {
			'class' : 'list-title',
			html : title
		}).appendTo('#result');
		$('<ul/>', {
			'class' : 'my-new-list',
			html : items.join('')
		}).appendTo('#result');
	}
}

function parseItem(key, val) {
	return '<li id="' + key + '"><a href="' + val.url
			+ '" target="_blank"><img src="' + val.imgUrl + '" alt="'
			+ val.movieName + '" /></a>' + val.movieName + '<br/>Pris: '
			+ val.price + ':-<br/><a href="' + val.url
			+ '" target="_blank" class="logo ' + val.supplier + '"></a></li>';
}

/**
 * Initialize active supplier urls on pageload
 */
function initSupplierURLs() {
	var urls = localStorage.getItem("mansehrServiceUrls");
	var lastAccess = localStorage.getItem("mansehrSULastAccess");
	var delta = 0;
	if (lastAccess != undefined) {
		var laTime = new Date(lastAccess);
		delta = (new Date().getTime() - laTime);
	}
	if (urls == undefined || isNaN(delta) || delta > 1800000) {
		localStorage.clear();
		$
				.getJSON(SERVICE_URI, {
					suppliers : version
				})
				.done(
						function(data) {
							localStorage.setItem("mansehrServiceUrls", JSON
									.stringify(data));
							localStorage.setItem("mansehrSULastAccess",
									new Date());
							parseUrls(data);
						})
				.fail(
						function(jqxhr, textStatus, error) {
							var err = textStatus + ', ' + error;
							console.log("Request Failed: " + err);
							$('#errMsg')
									.html(
											"Anropet f&ouml;r att h&auml;mta filmtj&auml;nster misslyckades. Kontrollera att du &auml;r ansluten till internet.");
						});
	} else {
		parseUrls(JSON.parse(urls));
	}
}

function parseUrls(data) {
	$.each(data, function(key, val) {
		debug(val.supplierId);
		var res = new Object();
		res.id = val.supplierId;
		res.url = val.url;
		supplierUrls.push(res);
	});
}

function searchSuppliers() {
	for ( var i in supplierUrls) {
		callSupplier(supplierUrls[i]);
	}
}

function callSupplier(sup) {
	try {
		var req = new XMLHttpRequest();
		req.open("GET", sup.url + movieName, true);
		req.onload = function(e) {
			supplierLoaded(e, sup.id);
		};
		req.onerror = function(e) {
			supplierError(e, sup.id);
		};
		req.send(null);
	} catch (e) {
		supplierError(e, sup.id);
	}
}

function supplierLoaded(e, id) {
	var res = new Object();
	res.id = id;
	res.xml = e.target.responseText;
	callParserService(res);
}

function supplierError(e, id) {
	var res = new Object();
	res.id = id;
	res.xml = 0;
	resultArray.push(res);
	debug(id + ', Result error: ' + resultArray.length);
}

function callParserService(sup) {
	$.post(SERVICE_URI, {
		"supplier" : sup.id,
		"data" : sup.xml,
		"movieName" : movieName
	// - Gör ingen filtrering på servern
	}, 'json').done(function(data) {
		parseJsonResult(data);
	}).fail(function(jqxhr, textStatus, error) {
		var err = textStatus + ', ' + error;
		console.log("Request Failed: " + err);
	}).always(function() {
		debug('Callback: ' + sup.id);
	});
}

function parseJsonResult(xml) {
	var json = JSON.parse(xml);

	$.each(json.goodMatchResult, function(key, val) {
		data.goodMatchResult.push(val);
	});

	$.each(json.otherResult, function(key, val) {
		data.otherResult.push(val);
	});

	parseResult(data);
}

var dbgTxt = '';
function debug(txt) {
	dbgTxt = dbgTxt + txt + '<br/>';
	if (DEBUG)
		$('#debugField').text(dbgTxt);
}
