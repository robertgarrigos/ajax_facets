(function ($) {

  /**
   * Class containing functionality for Facet API.
   */
  Drupal.ajax_facets = {};
  // Store current query value.
  Drupal.ajax_facets.queryState = null;
  // State of each facet.
  Drupal.ajax_facets.facetQueryState = null;
  // Determine if it is first page load. Will be reset in Drupal.ajax_facets.initHistoryState.
  Drupal.ajax_facets.firstLoad = true;
  // HTML ID of element of current facet.
  Drupal.ajax_facets.current_id = null;
  // Current changed facet.
  Drupal.ajax_facets.current_facet_name = null;
  // Settings of each ajax facet.
  Drupal.ajax_facets.facetsSettings = {};
  // Timer for ranges widget.
  Drupal.ajax_facets.timer;
  // Tooltip timeout handler.
  Drupal.ajax_facets.tooltipTimeout;

  // You can use it for freeze facet form elements while ajax is processing.
  Drupal.ajax_facets.beforeAjaxCallbacks = {};

  Drupal.ajax_facets.beforeAjax = function (context, settings, element) {
    $.each(Drupal.ajax_facets.beforeAjaxCallbacks, function () {
      if ($.isFunction(this)) {
        this(context, settings, element);
      }
    });
  };

  Drupal.behaviors.ajax_facets = {
    attach: function (context, settings) {
      if (!Drupal.ajax_facets.queryState) {
        if (settings.facetapi.defaultQuery != undefined && settings.facetapi.defaultQuery) {
          Drupal.ajax_facets.queryState = {'f': settings.facetapi.defaultQuery};
        } else {
          Drupal.ajax_facets.queryState = {'f': []};
        }
        // We will send original search path to server to get back proper reset links.
        if (settings.facetapi.searchPath != undefined) {
          Drupal.ajax_facets.queryState['searchPath'] = settings.facetapi.searchPath;
        }
        if (settings.facetapi.index_id != undefined) {
          Drupal.ajax_facets.queryState['index_id'] = settings.facetapi.index_id;
        }
        // Check view name and display name.
        if (settings.facetapi.view_name != undefined && settings.facetapi.display_name != undefined) {
          // Get view dom id.
          var viewDomId = Drupal.ajax_facets.getViewDomId(settings.facetapi.view_name, settings.facetapi.display_name);
          if (viewDomId) {
            Drupal.ajax_facets.queryState['view_dom_id'] = viewDomId;
            // View by ajax.
            if (Drupal.views && Drupal.views.instances['views_dom_id:' + viewDomId]) {
              $.extend(Drupal.ajax_facets.queryState, Drupal.views.instances['views_dom_id:' + viewDomId].settings);
            }
            // View without ajax.
            else {
              Drupal.ajax_facets.queryState['view_name'] = settings.facetapi.view_name;
              Drupal.ajax_facets.queryState['view_display_id'] = settings.facetapi.display_name;
              // Respect view arguments.
              var name_display = settings.facetapi.view_name + ':' + settings.facetapi.display_name;
              if (settings.facetapi.view_args[name_display]) {
                Drupal.ajax_facets.queryState['view_args'] = settings.facetapi.view_args[name_display];
              }
              // Respect view path.
              if (settings.facetapi.view_path[name_display]) {
                Drupal.ajax_facets.queryState['view_path'] = settings.facetapi.view_path[name_display];
              }
            }
          }
        }

        if (settings.facetapi.facet_field != undefined) {
          Drupal.ajax_facets.queryState['facet_field'] = settings.facetapi.facet_field;
        }
      }

      // Respect arguments in exposed form.
      if (settings.facetapi.view_name != undefined && settings.facetapi.display_name != undefined) {
        var name_display = settings.facetapi.view_name + ':' + settings.facetapi.display_name;
        if (settings.facetapi.exposed_input[name_display]) {
          $.extend(Drupal.ajax_facets.queryState, settings.facetapi.exposed_input[name_display]);
        }
      }

      // Iterates over facet settings, applies functionality like the "Show more"
      // links for block realm facets.
      // @todo We need some sort of JS API so we don't have to make decisions
      // based on the realm.
      if (settings.facetapi) {
        for (var index in settings.facetapi.facets) {
          Drupal.ajax_facets.bindResetLink(settings.facetapi.facets[index].id, index, settings);

          // Checkboxes.
          if (settings.facetapi.facets[index].widget == 'facetapi_ajax_checkboxes') {
            $('#' + settings.facetapi.facets[index].id + '-wrapper input.facet-multiselect-checkbox:not(.processed)').change(
              [settings.facetapi.facets[index]],
              Drupal.ajax_facets.processCheckboxes
            ).addClass('processed');

            // Make label of the checkbox clickable.
            $('#' + settings.facetapi.facets[index].id + '-wrapper ul li').click(
              function () {
                $(this).find('input').trigger('click');
              }
            );
          }

          // Selectboxes.
          if (settings.facetapi.facets[index].widget == 'facetapi_ajax_select') {
            $('#' + settings.facetapi.facets[index].id + '-wrapper select:not(.processed)').each(function () {
              $(this).change(
                [settings.facetapi.facets[index]],
                Drupal.ajax_facets.processSelectbox
              ).addClass('processed');
            });
          }

          // Links.
          if (settings.facetapi.facets[index].widget == 'facetapi_ajax_links') {
            $('#' + settings.facetapi.facets[index].id + '-wrapper a:not(.processed)').each(function () {
              $(this).click(
                [settings.facetapi.facets[index]],
                Drupal.ajax_facets.processLink
              ).addClass('processed');
            });
          }

          // Ranges.
          if (settings.facetapi.facets[index].widget == 'facetapi_ajax_ranges') {
            $('#' + settings.facetapi.facets[index].id + '-wrapper div.slider-wrapper:not(.processed)').each(function () {
              var $sliderWrapper = $(this);
              $sliderWrapper.slider({
                range: true,
                min: parseFloat($sliderWrapper.data('min')),
                max: parseFloat($sliderWrapper.data('max')),
                values: [ parseFloat($sliderWrapper.data('min-val')), parseFloat($sliderWrapper.data('max-val')) ],
                slide: function( event, ui ) {
                  Drupal.ajax_facets.processSlider($sliderWrapper, ui.values[0], ui.values[1]);
                }
              }).addClass('processed');

              // Bind input fields.
              var $sliderWrapperParent = $sliderWrapper.parent();
              $sliderWrapperParent.find("input[type='text']").each(function() {
                $(this).change(function() {
                  var min = $sliderWrapperParent.find('.ajax-facets-slider-amount-min').val();
                  var max = $sliderWrapperParent.find('.ajax-facets-slider-amount-max').val();
                  // If values are numeric and min less than max.
                  if (!isNaN(parseFloat(min)) && isFinite(min) && !isNaN(parseFloat(max)) && isFinite(max) && min < max) {
                    $sliderWrapper.slider('values', 0, min);
                    $sliderWrapper.slider('values', 1, max);
                    Drupal.ajax_facets.processSlider($sliderWrapper, min, max);
                  }
                });
              });

            });
          }

          if (null != settings.facetapi.facets[index].limit) {
            // Applies soft limit to the list.
            if (typeof(Drupal.facetapi) != 'undefined') {
              Drupal.facetapi.applyLimit(settings.facetapi.facets[index]);
            }
          }

          // Save settings for each facet by name.
          Drupal.ajax_facets.facetsSettings[settings.facetapi.facets[index].facetName] = settings.facetapi.facets[index];
        }
      }

      // Hide blocks with ajax-facets-empty-behavior.
      $('.ajax-facets-empty-behavior').parents('.block-facetapi').hide();

      // Add facets tooltip.
      $('body').once(function () {
        $(this).append('<div id="ajax-facets-tooltip"><span></span></div>');
      });
    }
  };

  Drupal.ajax_facets.bindResetLink = function (facetWrapperId, index, settings) {
    var facet_values = Drupal.ajax_facets.getFacetValues();
    if (facet_values[settings.facetapi.facets[index]['facetName']] != undefined) {
      $('#' + facetWrapperId + '-wrapper').find('a.reset-link').show();
    } else {
      $('#' + facetWrapperId + '-wrapper').find('a.reset-link').hide();
    }

    $('#' + facetWrapperId + '-wrapper').find('a.reset-link:not(".processed")').addClass('processed').click(function (event) {
      var $facet = $(this).parent().find('[data-facet-name]').first();
      var facetName = $facet.data('facet-name');
      Drupal.ajax_facets.excludeCurrentFacet(facetName);
      Drupal.ajax_facets.sendAjaxQuery($facet, true);
      event.preventDefault();
    });
  };

  /**
   * Callback for onClick event for widget selectbox.
   */
  Drupal.ajax_facets.processSelectbox = function (event) {
    var $this = $(this);
    var facetName = $this.data('facet-name');
    // Init history.
    Drupal.ajax_facets.initHistoryState($this);
    // If facets are already defined in queryState.
    if (Drupal.ajax_facets.queryState['f'] != undefined) {
      // Exclude all values for this facet from query.
      Drupal.ajax_facets.excludeCurrentFacet(facetName);

      /* Default value. */
      if ($this.find(":selected").val() == '_none') {
        delete Drupal.ajax_facets.queryState['f'][Drupal.ajax_facets.queryState['f'].length];
      } else {
        Drupal.ajax_facets.queryState['f'][Drupal.ajax_facets.queryState['f'].length] = facetName + ':' + $this.find(":selected").val();
      }
    }

    Drupal.ajax_facets.sendAjaxQuery($this, true);
  };

  /**
   * Callback for onClick event for widget checkboxes.
   */
  Drupal.ajax_facets.processCheckboxes = function (event) {
    var $this = $(this);
    var facetName = $this.data('facet-name');
    var name_value = facetName + ':' + $this.attr('data-facet-value');// $.data can round decimal values like 4.0 to 4, avoid it.
    var rawFacetName = $this.data('raw-facet-name');
    // Init history.
    Drupal.ajax_facets.initHistoryState($this);
    // If facets are already defined in queryState.
    if (Drupal.ajax_facets.queryState['f'] != undefined) {
      var queryNew = new Array();
      if ($this.is(':checked')) {
        var addCurrentParam = true;
        for (var index in Drupal.ajax_facets.queryState['f']) {
          // If we already have this value in queryState.
          if (Drupal.ajax_facets.queryState['f'][index] == name_value) {
            addCurrentParam = false;
          }
        }
        // Add new value if need.
        if (addCurrentParam) {
          // Exclude all other values of this facet from query.
          if (Drupal.ajax_facets.facetsSettings[rawFacetName].limit_active_items) {
            Drupal.ajax_facets.excludeCurrentFacet(facetName);
          }
          Drupal.ajax_facets.queryState['f'][Drupal.ajax_facets.queryState['f'].length] = name_value;
        }
      }
      // If we unset filter, remove it from query.
      else {
        for (var index in Drupal.ajax_facets.queryState['f']) {
          if (Drupal.ajax_facets.queryState['f'][index] != name_value) {
            queryNew[queryNew.length] = Drupal.ajax_facets.queryState['f'][index];
          }
        }
        Drupal.ajax_facets.queryState['f'] = queryNew;
      }
    }

    Drupal.ajax_facets.sendAjaxQuery($this, true);
  };

  /**
   * Callback for onClick event for widget links.
   */
  Drupal.ajax_facets.processLink = function (event) {
    var $this = $(this);
    var facetName = $this.data('facet-name');
    var name_value = facetName + ':' + $this.attr('data-facet-value');// $.data can round decimal values like 4.0 to 4, avoid it.
    var rawFacetName = $this.data('raw-facet-name');
    // Init history.
    Drupal.ajax_facets.initHistoryState($this);
    // If facets are already defined in queryState.
    if (Drupal.ajax_facets.queryState['f'] != undefined) {
      var queryNew = new Array();
      /* Handle value - deactivate. */
      if ($this.hasClass('facetapi-active')) {
        for (var index in Drupal.ajax_facets.queryState['f']) {
          if (Drupal.ajax_facets.queryState['f'][index] != name_value) {
            queryNew[queryNew.length] = Drupal.ajax_facets.queryState['f'][index];
          }
        }
        Drupal.ajax_facets.queryState['f'] = queryNew;
      }
      /* Handle value - activate. */
      else if ($this.hasClass('facetapi-inactive')) {
        var addCurrentParam = true;
        for (var index in Drupal.ajax_facets.queryState['f']) {
          if (Drupal.ajax_facets.queryState['f'][index] == name_value) {
            addCurrentParam = false;
          }
        }
        if (addCurrentParam) {
          // Exclude all other values of this facet from query.
          if (Drupal.ajax_facets.facetsSettings[rawFacetName].limit_active_items) {
            Drupal.ajax_facets.excludeCurrentFacet(facetName);
          }
          Drupal.ajax_facets.queryState['f'][Drupal.ajax_facets.queryState['f'].length] = name_value;
        }
      }
    }

    Drupal.ajax_facets.sendAjaxQuery($this, true);
    event.preventDefault();
  };

  /**
   * Callback for slide event for widget ranges.
   */
  Drupal.ajax_facets.processSlider = function($sliderWrapper, min, max) {
    window.clearTimeout(Drupal.ajax_facets.timer);
    Drupal.ajax_facets.timer = window.setTimeout(
      function() {
        var facetName = $sliderWrapper.data('facet-name');
        // Init history.
        Drupal.ajax_facets.initHistoryState($sliderWrapper);
        // If facets are already defined in queryState.
        if (Drupal.ajax_facets.queryState['f'] != undefined) {
          // Exclude all values for this facet from query.
          Drupal.ajax_facets.excludeCurrentFacet(facetName);
          Drupal.ajax_facets.queryState['f'][Drupal.ajax_facets.queryState['f'].length] = facetName + ':[' + min + ' TO ' + max + ']';
        }

        Drupal.ajax_facets.sendAjaxQuery($sliderWrapper, true);
      },
      600
    );
  }

  /**
   * Exclude all values for this facet from query.
   */
  Drupal.ajax_facets.excludeCurrentFacet = function (facetName) {
    facetName = facetName + ':';
    var queryNew = new Array();
    for (var index in Drupal.ajax_facets.queryState['f']) {
      if (Drupal.ajax_facets.queryState['f'][index].substring(0, facetName.length) != facetName) {
        queryNew[queryNew.length] = Drupal.ajax_facets.queryState['f'][index];
      }
    }
    Drupal.ajax_facets.queryState['f'] = queryNew;
  }

  /**
   * Send ajax.
   */
  Drupal.ajax_facets.sendAjaxQuery = function ($this, pushStateNeeded) {
    Drupal.ajax_facets.current_id = $this.attr('data-facet-uuid');
    Drupal.ajax_facets.current_facet_name = $this.data('raw-facet-name');
    Drupal.ajax_facets.beforeAjax();
    var data = Drupal.ajax_facets.queryState;
    // Render the exposed filter data to send along with the ajax request
    var exposedFormId = '#views-exposed-form-' + Drupal.ajax_facets.queryState['view_name'] + '-' + Drupal.ajax_facets.queryState['display_name'];
    exposedFormId = exposedFormId.replace(/\_/g, '-');
    $.each($(exposedFormId).serializeArray(), function (index, value) {
      data[value.name] = value.value;
    });
    var settings = {
      url : encodeURI(Drupal.settings.basePath + Drupal.settings.pathPrefix + 'ajax/ajax_facets/refresh'),
      submit : {'ajax_facets' : data}
    };
    var ajax = new Drupal.ajax(false, false, settings);
    ajax.success = function(response, status) {
      // Push new state only on successful ajax response.
      if (pushStateNeeded) {
        var stateUrl = Drupal.ajax_facets.getFacetsQueryUrl(Drupal.settings.basePath + Drupal.settings.pathPrefix + Drupal.settings.facetapi.searchPath),
        state = {
          current_id: Drupal.ajax_facets.current_id,
          current_facet_name: Drupal.ajax_facets.current_facet_name,
          facets: Drupal.ajax_facets.queryState['f']
        };
        Drupal.ajax_facets.pushState(state, document.title, stateUrl);
      }
      // Pass back to original method.
      Drupal.ajax.prototype.success.call(this, response, status);
    };
    ajax.eventResponse(ajax, {});
  },

  Drupal.ajax_facets.getFacetValues = function () {
    var f = Drupal.ajax_facets.queryState.f;
    var facets_values = {};
    var symbol = ':';
    jQuery.each(f, function (k, v) {
      var parts = v.split(symbol);
      var value = parts[parts.length - 1];
      var appendix = symbol + value;
      var key = decodeURIComponent(v.substr(0, v.length - appendix.length));
      facets_values[key] = value;
    });
    return facets_values;
  },

  /* Show tooltip if facet results are not updated by ajax (in settings). */
  Drupal.ajax_facets.showTooltip = function ($, response) {
    // Reset the timeout handler to avoid troubles when user is clicking on items very fast.
    window.clearTimeout(Drupal.ajax_facets.tooltipTimeout);

    var pos = $('[data-facet-uuid=' + Drupal.ajax_facets.current_id + ']').offset();
    jQuery('#ajax-facets-tooltip').css('top', pos.top - 15);
    jQuery('#ajax-facets-tooltip').css('left', pos.left - jQuery('#ajax-facets-tooltip').width() - 40);
    jQuery('#ajax-facets-tooltip').show();
    jQuery('#ajax-facets-tooltip span').html(Drupal.t('Found:') + ' ' + '<a href="' + response.applyUrl + '">' + response.total_results + '</a>');

    Drupal.ajax_facets.tooltipTimeout = setTimeout(function () {
      jQuery('#ajax-facets-tooltip').hide(250);
    }, 3000);
  }

  /* Get view dom id for both modes of views - ajax/not ajax. */
  Drupal.ajax_facets.getViewDomId = function(view_name, display_name) {
    var view = $('.view-id-' + view_name + '.view-display-id-' + display_name);
    if (view.length < 1) {
      return false;
    }
    var classes = view.attr('class').split(' ');
    var viewDomId = false;
    $.each(classes, function(k, val) {
        if (val.substr(0, 11) == 'view-dom-id') {
          viewDomId = val.replace('view-dom-id-', '');
        }
      }
    )
    return viewDomId;
  }

  /**
   * Returns query string with selected facets.
   */
  Drupal.ajax_facets.getFacetsQueryUrl = function (baseUrl) {
    var query = {
      'f': []
    };

    // Clone variable.
    $.extend(true, query.f, Drupal.ajax_facets.queryState.f);

    // Facetapi module has a bug when facet name encodes twice.
    // For example to get this facet work 'category:name:pineapple' it should be 'category%253Aname%3Apineapple'.
    // It means that first ':' was encoded twice. Why we don't patch facetapi? Because a lot of sites have already
    // used facetapi module and they links (with wrong encoded facets names) has been indexed by search engines
    // like Bing or Google. So we just bring this behaviour to ajax_facets module.
    // Encode each facet filter name (it have already encoded once in FacetapiAjaxWidgetCheckboxes::buildListItems()).
    for (var filter in query.f) {
      query.f[filter] = encodeURI(query.f[filter]);
    }

    if (Drupal.ajax_facets.queryState.query) {
      query.query = Drupal.ajax_facets.queryState.query;
    }

    if (Drupal.ajax_facets.queryState.order) {
      query.order = Drupal.ajax_facets.queryState.order;
      query.sort = Drupal.ajax_facets.queryState.sort;
    }

    if (Drupal.ajax_facets.queryState.pages) {
      query.pages = Drupal.ajax_facets.queryState.pages;
    }

    // Respect existing query parameters in url.
    // Merge respected parameters with facet parameters recursively without duplicates.
    $.extend(true, query, Drupal.ajax_facets.simplifyObject(Drupal.ajax_facets.getAdditionalQueryParameters()));

    // Add query string to base url.
    if (!$.isEmptyObject(query)) {
      baseUrl += '?' + decodeURIComponent($.param(query));
    }

    return baseUrl;
  };

  /**
   * Returns additional (not facet) query parameters from current url.
   */
  Drupal.ajax_facets.getAdditionalQueryParameters = function () {
    var result = {};

    // If we have GET params.
    if (window.location.href.indexOf('?') != -1) {
      var respectedParameters = window.location.href.split('?')[1].split('&');

      // Get all query parameters in array.
      for (var i = 0; i < respectedParameters.length; i++) {
        var pair = respectedParameters[i].split('=');

        // Remove brackets from multiple parameter.
        pair[0] = pair[0].replace('[]', '');

        // We interested only in additional parameters but not in facet parameters.
        if (pair[0] != 'f') {
          if (!result[pair[0]]) {
            result[pair[0]] = [];
            result[pair[0]].push(pair[1]);
          } else {
            result[pair[0]].push(pair[1]);
          }
        }
      }
    }

    return result;
  };

  /**
   * Returns simplified object.
   *
   * If object has array property with only one element then that array will be turn into simple value instead of array.
   */
  Drupal.ajax_facets.simplifyObject = function (obj) {
    for (var name in obj) {
      if (obj[name].length === 1) {
        obj[name] = obj[name][0];
      }
    }

    return obj;
  };

  /**
   * Initialize the history state. We only want to do this on the initial page
   * load but we can't call it until after a facet has been clicked because we
   * need to communicate which one is being "deactivated" for our ajax success
   * handler.
   */
  Drupal.ajax_facets.initHistoryState = function ($facet) {
    // Set the initial state only initial page load.
    if (Drupal.ajax_facets.firstLoad) {
      Drupal.ajax_facets.firstLoad = false;

      // If history.js available - use it.
      if (Drupal.settings.facetapi.isHistoryJsExists) {
        History.replaceState({
          current_id: $facet.attr('id'),
          current_facet_name: $facet.data('facet'),
          facets: Drupal.ajax_facets.queryState['f']
        }, null, null);
      } else {
        // Fallback to HTML5 history object.
        if (typeof history.replaceState != 'undefined') {
          history.replaceState({
            current_id: $facet.attr('id'),
            current_facet_name: $facet.data('facet'),
            facets: Drupal.ajax_facets.queryState['f']
          }, null, null);
        }
      }
    }
  };

  /**
   * Pushes new state to browser history.
   *
   * History.js library fires "statechange" event even on API push/replace calls.
   * So before pushing new state to history we should unbind from this event and after bind again.
   */
  Drupal.ajax_facets.pushState = function (state, title, stateUrl) {
    // If history.js available - use it.
    if (Drupal.settings.facetapi.isHistoryJsExists) {
      var $window = $(window);

      $window.unbind('statechange', Drupal.ajax_facets.reactOnStateChange);
      History.pushState(state, title, stateUrl);
      $window.bind('statechange', Drupal.ajax_facets.reactOnStateChange);
    } else {
      // Fallback to HTML5 history object.
      if (typeof history.pushState != 'undefined') {
        history.pushState(state, title, stateUrl);
      }
    }
  };

  /**
   * Callback for back/forward browser buttons.
   */
  Drupal.ajax_facets.reactOnStateChange = function () {
    var state = null,
      facets = [],
      current_id = '';

    // If history.js available - use it.
    if (Drupal.settings.facetapi.isHistoryJsExists) {
      state = History.getState();

      facets = state.data.facets;
      current_id = state.data.current_id;
    } else {
      // Fallback to HTML5 history object.
      if (typeof history.pushState != 'undefined') {
        state = history.state;

        facets = state.facets;
        current_id = state.current_id;
      }
    }

    Drupal.ajax_facets.queryState['f'] = facets;
    Drupal.ajax_facets.sendAjaxQuery($('#' + current_id), false);
  };

  // If user opened new page and then clicked browser's back button then would not be fired "statechange" event.
  // So we need to bind on 'statechange' event and react only once.
  // All farther work does Drupal.ajax_facets.pushState() function.
  // If history.js Adapter available - use it to bind "statechange" event.
  if (typeof History.Adapter != 'undefined') {
    History.Adapter.bind(window, 'statechange', function () {
      if (Drupal.ajax_facets.firstLoad) {
        Drupal.ajax_facets.reactOnStateChange();
      }
    });
  } else {
    // Fallback to default HTML5 event.
    window.onpopstate = function () {
      if (Drupal.ajax_facets.firstLoad) {
        Drupal.ajax_facets.reactOnStateChange();
      }
    };
  }

  if (Drupal.ajax) {
    // Command for process search results and facets by ajax.
    Drupal.ajax.prototype.commands.ajax_facets_update_content = function(ajax, response) {
      if (response.data.activeItems != undefined) {
        Drupal.ajax_facets.facetQueryState = response.data.activeItems;
      }
      // After Ajax success we should update reset, apply link to handle proper redirects.
      if (response.data.resetUrls != undefined && Drupal.settings.facetapi.facets != undefined) {
        for (index in Drupal.settings.facetapi.facets) {
          if (response.data.resetUrls[Drupal.settings.facetapi.facets[index].facetName] != undefined) {
            // Update path from response.
            Drupal.settings.facetapi.facets[index].resetPath = response.data.resetUrls[Drupal.settings.facetapi.facets[index].facetName];
          }
        }
      }

      // Update the exposed form separately if needed.
      if (response.data.exposed_form) {
        var viewId = response.data.views_name + '-' + response.data.display_id;
        $('#views-exposed-form-' + viewId.replace(/_/g, '-')).replaceWith(response.data.exposed_form)
      }

      // Update content.
      if (response.data.newContent != undefined && response.data.newContent) {
        for (var id in response.data.newContent) {
          var $blockToReplace = $('#' + id + '-wrapper');
          if ($blockToReplace.size()) {
            $blockToReplace.replaceWith(response.data.newContent[id]);
          }
          var $block = $('#' + id + '-wrapper').parents('div.block-facetapi:not(:visible)');
          if ($block.size()) {
            $block.show();
          }
        }
      }

      /* Update results. */
      var show_tip = false;
      $.each(response.data.update_results, function (facet_name, mode) {
        if (Drupal.ajax_facets.current_facet_name == facet_name) {
          /* Update by ajax. */
          if (mode) {
            $('.view-id-' + response.data.views_name + '.view-display-id-' + response.data.display_id).replaceWith(response.data.views_content);
          }
          /* Update by link. */
          else {
            show_tip = true;
          }
        }
      });

      // As some blocks could be empty in results of filtering - hide them.
      if (response.data.hideBlocks != undefined && response.data.hideBlocks) {
        for (var id in response.data.hideBlocks) {
          var $block = $('#' + response.data.hideBlocks[id]);
          if ($block.size()) {
            $block.hide();
          }
        }
      }

      if (response.data.settings.views != undefined) {
        Drupal.settings.views = response.data.settings.views;
      }

      Drupal.attachBehaviors();
      if (show_tip) {
        Drupal.ajax_facets.showTooltip($, response.data);
      }
    }
  }
})(jQuery);
