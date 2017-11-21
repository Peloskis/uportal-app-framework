/*
 * Licensed to Apereo under one or more contributor license
 * agreements. See the NOTICE file distributed with this work
 * for additional information regarding copyright ownership.
 * Apereo licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file
 * except in compliance with the License.  You may obtain a
 * copy of the License at the following location:
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
'use strict';

define(['angular'], function(angular) {
  return angular.module('portal.messages.controllers', [])

    .controller('MessagesController', ['$q', '$log', '$scope', '$rootScope',
      '$location', '$localStorage', '$sessionStorage', '$filter', '$mdDialog',
      'APP_FLAGS', 'MISC_URLS', 'SERVICE_LOC', 'miscService', 'messagesService',
      'keyValueService', 'KV_KEYS',
      function($q, $log, $scope, $rootScope, $location, $localStorage,
               $sessionStorage, $filter, $mdDialog, APP_FLAGS, MISC_URLS,
               SERVICE_LOC, miscService, messagesService, keyValueService,
               KV_KEYS) {
        // //////////////////
        // Local variables //
        // //////////////////
        var allMessages = [];
        var promiseFilteredMessages = {};
        $scope.APP_FLAGS = APP_FLAGS;
        $scope.MISC_URLS = MISC_URLS;
        $scope.showMessagesFeatures = true;

        $scope.$on('refreshMessages', function() {
          refreshAllMessages()
            .then(function(result) {
              return resolveData($scope.messages);
            }).catch(function(error) {
              $log.warn(error);
            })
          ;
        });

        $scope.$on('resolveMessages', function() {
          return resolveData($scope.messages)
            .then(function(result) {
                return null;
            })
            .catch(function(error) {
              $log.warn(error);
            });
        });

        $scope.$on('dismissMessage', function(event, dismissedId) {
          var ids = [];
          if (!$scope.seenMessageIds) {
            ids = getSeenMessageIds();
            $q.$resolve(ids);
          } else {
            ids = $scope.seenMessageIds;
          }
          var index = ids.indexOf(dismissedId);
          if (index == -1) {
            ids.push(dismissedId);
            keyValueService.setValue(KV_KEYS.VIEWED_MESSAGE_IDS, ids)
              .then(function(result) {
                $scope.$broadcast('messageDismissed');
                return result;
              })
              .catch(function(error) {
                $log.warn(error);
              });
          }
        });

        var refreshAllMessages = function() {
          $scope.hasMessages = false;
          var promises = [];
          promises.push(getMessages());
          promises.push(getSeenMessageIds());

          $q.all(promises)
            .then(function(result) {
              if (result[0] && angular.isArray(result[0])) {
                $scope.messages = result[0];
                resolveData($scope.messages);
              } else {
                result[0] = [];
                $scope.messages = [];
              }

              if (result[1] && angular.isArray(result[1])) {
                $scope.seenMessageIds[1];
              } else {
                result[1] = [];
                $scope.seenMessageIds = [];
              }
              return result;
            })
            .catch(function(error) {
              $log.warn(error);
              $scope.$broadcast('messagesError');
            });
        };

        // ////////////////
        // Local methods //
        // ////////////////
        /**
         * Get all messages, then pass result on for filtering
         */
        var getMessages = function() {
          messagesService.getAllMessages()
            .then(function(result) {
              // Ensure messages exist and check for group filtering
              if (angular.isArray(result) && result.length > 0) {
                allMessages = result;

                resolveData(allMessages);
              }
              return result;
            })
            .catch(function(error) {
              $log.warn('Problem getting all messages for messages controller');
              return error;
            });
          return $scope.messages;
        };

        var resolveData = function(messages) {
          $scope.$broadcast('messagesResolving');
          var fetchedData = [];
          var fetchedTitle = [];
          var fetchedGroups = [];

          messagesService.getMessagesByGroup(messages)
            .then(function(result) {
              fetchedGroups = result;
              angular.forEach(fetchedGroups, function(message) {
                if (message.audienceFilter.dataUrl) {
                  fetchedData.push(message);
                }
                if (message.titleUrl) {
                  fetchedTitle.push(message);
                }
              });
              return null;
            })
            .catch(function(error) {
              $log.warn(error);
            });
            
            if (fetchedData.length == 0 && fetchedTitle.length == 0) {
              $scope.$broadcast('messagesResolved');
              return fetchedGroups;
            }

            var commonality = true;

            angular.forEach(fetchedData, function(result) {
              var index = fetchedTitle.indexOf(result);
              if (index != -1) {
                commonality = true;
              }
            });
            
            var promises = [];
            var promiseData = messagesService.getMessagesByData(fetchedData);
            var promiseTitle = messagesService.getMessagesByTitle(fetchedTitle);
            promises.push(promiseData);
            promises.push(promiseTitle);
            $q.all(promises)
              .then(function(result) {
                  fetchedData = result[0];
                  fetchedTitle = result[1];
                  $scope.$broadcast('messagesResolved');
                  return result;
              })
              .catch(function(error) {
                $log.warn(error);
              });
                
            if (commonality) {
              $log.warn('Do I get here');
            }
          };

        var getSeenMessageIds = function() {
          messagesService.getSeenMessageIds()
            .then(function(result) {
              if (result && angular.isArray(result)) {
                $scope.seenMessageIds = result;
              } else {
                $log.warn('Unexpected result fetching seen ids ' + result);
                $scope.allSeenMessageIds = [];
              }
              return $scope.seenMessageIds;
            })
            .catch(function(error) {
              $log.warn(error);
              $scope.seenMessageIds = [];
            });
            return $scope.seenMessageIds;
        };

        /**
         * Determine whether or not messages need to be filtered
         * by group and data, then execute the relevant promises
         */
        var filterMessages = function() {
          // Check if group filtering has been disabled
          if ($localStorage.disableGroupFilteringForMessages) {

            // Define promises to run if filtering is turned on
            promiseFilteredMessages = {
              filteredByGroup:
                messagesService.getAllMessages(),
              filteredByData:
                messagesService.getMessagesByData(allMessages),
              filteredByTitle:
                messagesService.getMessagesByTitle(allMessages),
            };
          } else {
            promiseFilteredMessages = {
              filteredByGroup:
                messagesService.getMessagesByGroup(allMessages),
              filteredByData:
                messagesService.getMessagesByData(allMessages),
              filteredByTitle:
                messagesService.getMessagesByTitle(allMessages),
            };
          }
            // Call filtered notifications promises, then pass on to
            // the completion function
            $q.all(promiseFilteredMessages)
              .then(filterMessagesSuccess)
              .catch(filterMessagesFailure);
        };

        /**
         * Separate the message types in scope for child controllers
         * @param {Object} result
         */
        var filterMessagesSuccess = function(result) {
          // Check for filtered notifications
          var filteredMessages = [];
          if (result.filteredByGroup && result.filteredByData
            && result.filteredByTitle) {
            // Combine the three filtered arrays into one (no dupes)
            filteredMessages = $filter('filterForCommonElements')(
              result.filteredByGroup,
              result.filteredByData
            );
            var reFilteredMessages = $filter('filterForCommonElements')(
              result.filteredByTitle,
              filteredMessages
            );
            $scope.messages =
              $filter('separateMessageTypes')(reFilteredMessages);
          }
        };

        /**
         * Handle errors that occur while resolving promises to
         * get notifications
         * @param {Object} error
         */
        var filterMessagesFailure = function(error) {
          $scope.messages = [];
          $log.warn('Problem getting messages from messagesService');
        };

        /**
         * Get messages if messaging features are enabled
         */
        var init = function() {
          $scope.hasMessages = false;
          $scope.messages = {};

          if (!$rootScope.GuestMode && SERVICE_LOC.messagesURL
            && SERVICE_LOC.messagesURL !== '') {
            getMessages();
            getSeenMessageIds();
          } else {
            // Messages features aren't configured properly, possibly
            // on purpose. Communicate this and hide features.
            $scope.showMessagesFeatures = false;
            $scope.messagesError = 'SERVICE_LOC.messageURL is not configured ' +
              '-- hiding messages features.';
            $scope.hasMessages = true;
          }
        };

        init();
      },
    ])

    .controller('NotificationsController', ['$q', '$log', '$scope', '$window',
      '$rootScope', '$location', '$localStorage', '$filter', 'MESSAGES',
      'SERVICE_LOC', 'miscService', 'messagesService', 'orderByFilter',
      function($q, $log, $scope, $window, $rootScope, $location, $localStorage,
               $filter, MESSAGES, SERVICE_LOC, miscService, messagesService,
               orderByFilter) {
        // //////////////////
        // Local variables //
        // //////////////////
        var vm = this;
        var allNotifications = [];
        var separatedNotifications = {};
        var dismissedNotificationIds = [];
        var allSeenMessageIds = [];

        // Promise to get seen message IDs
        var promiseSeenMessageIds = {
          seenMessageIds: messagesService.getSeenMessageIds(),
        };

        // ///////////////////
        // Bindable members //
        // ///////////////////
        vm.notifications = [];
        vm.dismissedNotifications = [];
        vm.priorityNotifications = [];
        vm.notificationsUrl = MESSAGES.notificationsPageURL;
        vm.status = 'View notifications';
        vm.isLoading = true;
        vm.renderLimit = 3;
        vm.showMessagesFeatures = true;

        $scope.$on('messagesRefreshed', function(event, messages) {
          vm.notifications = $scope.$parent.messages;
          vm.dismissedNotificationIds = $scope.$parent.seenMessageIds;
          vm.priorityNotifications = $filter('filter')(
            vm.notifications,
            {priority: 'high'}
          );
        });

        // //////////////////
        // Event listeners //
        // //////////////////

        $scope.$on('messageDismissed', function() {
          configurePriorityNotificationsScope();
        });

        // ////////////////
        // Local methods //
        // ////////////////
        /**
         * Alert the UI to show priority notifications if they exist
         */
        var configurePriorityNotificationsScope = function() {
          // Use angular's built-in filter to grab priority notifications
          vm.priorityNotifications = $filter('filter')(
            vm.notifications,
            {priority: 'high'}
          );
          // If priority notifications exist, notify listeners
          messagesService.broadcastPriorityFlag(
            vm.priorityNotifications.length > 0
          );
          // If there is only one priority notification, track
          // rendering in analytics
          if (vm.priorityNotifications.length === 1) {
            vm.pushGAEvent(
              'Priority notification',
              'Render',
              vm.priorityNotifications[0].id
            );
          }
        };

        /**
         * Alerts the UI that there are no priority notifications to show
       
        var clearPriorityNotificationsFlags = function() {
          vm.priorityNotifications = [];
          // Notify listeners that priority notifications are gone
          messagesService.broadcastPriorityFlag(false);
        };
          */

        // ////////////////
        // Scope methods //
        // ////////////////
        /**
         * Check if user is viewing notifications page
         * @return {boolean}
         */
        vm.isNotificationsPage = function() {
          return $window.location.pathname === MESSAGES.notificationsPageURL;
        };

        /**
         * On-click event to mark a notification as "seen"
         * @param {Object} notification
         * @param {boolean} isHighPriority
         */
        vm.dismissNotification = function(notification, isHighPriority) {
          $scope.$emit('dismissMessage', notification.id);
        };
        /**
          vm.notifications = $filter('filterOutMessageWithId')(
            vm.notifications,
            notification.id
          );
          // Add notification to dismissed array
          vm.dismissedNotifications.push(notification);

          // Add notification's ID to local array of dismissed notification IDs
          dismissedNotificationIds.push(notification.id);

          // Call service to save changes if k/v store enabled
          if (SERVICE_LOC.kvURL) {
            messagesService.setMessagesSeen(allSeenMessageIds,
              dismissedNotificationIds, 'dismiss');
          }

          // Clear priority notification flags if it was a priority
          // notification
          if (isHighPriority) {
            clearPriorityNotificationsFlags();
          }
           
          $scope.$emit('dismissMessage', notification.id);
        };
 */
        /**
         * On-click event to mark a notification as "unseen"
         * @param {Object} notification
         * @param {boolean} isHighPriority
         */
        vm.restoreNotification = function(notification, isHighPriority) {
          // Remove notification from dismissed array
          vm.dismissedNotifications = $filter('filterOutMessageWithId')(
            vm.dismissedNotifications,
            notification.id
          );

          // Add notification to non-dismissed array
          vm.notifications.push(notification);

          // Remove the corresponding entry from
          // local array of dismissed notification IDs
          var index = dismissedNotificationIds.indexOf(notification.id);
          if (index !== -1) {
            dismissedNotificationIds.splice(index, 1);
          }
          // Call service to save changes if k/v store enabled
          if (SERVICE_LOC.kvURL) {
            messagesService.setMessagesSeen(allSeenMessageIds,
              dismissedNotificationIds, 'restore');
          }

          // Reconfigure priority scope if a priority notification was restored
          if (isHighPriority) {
            configurePriorityNotificationsScope();
          }
        };

        /**
         * Log a Google Analytics event for each notification rendered
         * when a user opens the notifications bell menu
         */
        vm.trackRenderedNotifications = function() {
          // Order notifications by priority flag
          var orderedNotifications = orderByFilter(
            vm.notifications,
            'priority'
          );
          // Slice array to first 3 entries (the ones that would be rendered)
          orderedNotifications = $filter('limitTo')(
            orderedNotifications,
            vm.renderLimit
          );
          // Log a render event for each rendered notification
          angular.forEach(orderedNotifications, function(notification) {
            vm.pushGAEvent(
              'Notification menu',
              'Rendered notification',
              notification.id
            );
          });
        };

        /**
         * Track clicks on "Notifications" links in mobile menu and top bar
         * @param {string} category - Context of the event
         * @param {string} action - Action taken
         * @param {string} label - Label/data pertinent to event
         */
        vm.pushGAEvent = function(category, action, label) {
          miscService.pushGAEvent(category, action, label);
        };


        var init = function() {
          if (!$scope.$parent.hasMessages) {
            $scope.$emit('refreshMessages');
            return null;
          }
        };

        init();
    }])

    .controller('AnnouncementsController', ['$q', '$log', '$filter',
      '$sessionStorage', '$scope', '$rootScope', '$document', '$sanitize',
      '$mdDialog', 'miscService',
      'messagesService', 'PortalAddToHomeService', 'MISC_URLS',
      function($q, $log, $filter, $sessionStorage, $scope, $rootScope,
               $document, $sanitize, $mdDialog, miscService,
               messagesService, PortalAddToHomeService, MISC_URLS) {
        // //////////////////
        // Local variables //
        // //////////////////
        var vm = this;
        var allAnnouncements = [];
        var separatedAnnouncements = {};
        var seenAnnouncementIds = [];
        var popups = [];
        var allSeenMessageIds = [];

        // Promise to get seen message IDs
        var promiseSeenMessageIds = {
          seenMessageIds: messagesService.getSeenMessageIds(),
        };

        // ///////////////////
        // Bindable members //
        // ///////////////////
        vm.hover = false;
        vm.active = false;
        vm.mode = $scope.mode;
        vm.announcements = [];
        vm.showMessagesFeatures = true;

        // //////////////////
        // Event listeners //
        // //////////////////
        /**
         * When the parent controller has messages, initialize
         * things dependent on messages
         */
        $scope.$watch('$parent.hasMessages', function(hasMessages) {
          // If the parent scope has messages and messages config is set up,
          // complete initialization
          if (hasMessages) {
            if (angular.equals($scope.$parent.showMessagesFeatures, true)) {
              configureAnnouncementsScope();
            } else {
              vm.showMessagesFeatures = false;
              vm.isLoading = false;
            }
          }
        });

        // ////////////////
        // Local methods //
        // ////////////////
        /**
         * Inherit announcements from parent controller messages
         */
        var configureAnnouncementsScope = function() {
          if ($scope.$parent.messages.announcements) {
            allAnnouncements = $scope.$parent.messages.announcements;
            // Get seen message IDs, then configure scope
            $q.all(promiseSeenMessageIds)
              .then(getSeenMessageIdsSuccess)
              .catch(getSeenMessageIdsFailure);
          }
        };

        /**
         * Separate seen and unseen, then set mascot image or get popups
         * depending on directive mode.
         * @param {Object} result - Data returned by promises
         */
        var getSeenMessageIdsSuccess = function(result) {
          if (result.seenMessageIds && angular.isArray(result.seenMessageIds)
            && result.seenMessageIds.length > 0) {
            // Save all seenMessageIds for later
            allSeenMessageIds = result.seenMessageIds;

            // Separate seen and unseen
            separatedAnnouncements = $filter('filterSeenAndUnseen')(
              allAnnouncements,
              result.seenMessageIds
            );
            // Set local seenAnnouncementsIds (used for tracking seen
            // messages in the K/V store and sessionStorage
            angular.forEach(separatedAnnouncements.seen, function(value) {
              seenAnnouncementIds.push(value.id);
            });
          } else {
            separatedAnnouncements = {
              seen: [],
              unseen: allAnnouncements,
            };
          }

          $filter('addToHome')(
            separatedAnnouncements.unseen,
            MISC_URLS, PortalAddToHomeService
          );


          // If directive mode need mascot, set it, otherwise
          // configure popups
          if (vm.mode === 'mascot' || vm.mode === 'mobile-menu') {
            // Set scope announcements
            vm.announcements = separatedAnnouncements.unseen;
            // Set the mascot image
            setMascot();
            // Notify listeners if there are unseen announcements
            messagesService.broadcastAnnouncementFlag(
              vm.announcements.length > 0
            );
          } else {
            // Filter out low priority announcements
            popups = $filter('filter')(
              separatedAnnouncements.unseen,
              {priority: 'high'}
            );
            configurePopups();
          }
        };

        /**
         * Handle errors encountered while resolving promises
         * @param {Object} error
         */
        var getSeenMessageIdsFailure = function(error) {
          // HANDLE ERRORS
        };

        /**
         * Get the latest popup announcement and display it
         */
        var configurePopups = function() {
          // If they exist, put them in order by date, then id
          if (popups.length != 0) {
            var orderedPopups = $filter('orderBy')(
              popups,
              ['goLiveDate', 'id']
            );

            // Set the latest announcement as a scope variable
            // so it can be passed to the dialog
            $scope.latestAnnouncement = orderedPopups[0];

            // Display the latest popup announcement
            var displayPopup = function() {
              $mdDialog.show({
                templateUrl:
                  'portal/messages/partials/announcement-popup-template.html',
                parent: angular.element(document).find('div.my-uw')[0],
                clickOutsideToClose: true,
                openFrom: 'left',
                closeTo: 'right',
                preserveScope: true,
                scope: $scope,
                controller: function DialogController($scope, $mdDialog) {
                  $scope.closeDialog = function(action) {
                    $mdDialog.hide(action);
                  };
                },
              })
              .then(function(action) {
                // If dialog is closed by clicking "continue" button
                miscService.pushGAEvent(
                  'popup',
                  action,
                  $scope.latestAnnouncement.id
                );
                seenAnnouncementIds.push($scope.latestAnnouncement.id);
                messagesService.setMessagesSeen(allSeenMessageIds,
                  seenAnnouncementIds, 'dismiss');
                return action;
              })
              .catch(function() {
                // If popup is closed by clicking outside or pressing escape
                miscService.pushGAEvent(
                  'popup', 'dismissed', $scope.latestAnnouncement.id);
                seenAnnouncementIds.push($scope.latestAnnouncement.id);
                messagesService.setMessagesSeen(allSeenMessageIds,
                  seenAnnouncementIds, 'dismiss');
              });
            };
            displayPopup();
          }
        };

        /**
         * Set the mascot image and its fallback
         */
        var setMascot = function() {
          if ($rootScope.portal && $rootScope.portal.theme) {
            vm.mascotImage =
              $rootScope.portal.theme.mascotImg || 'img/robot-taco.gif';
          } else {
            vm.mascotImage = 'img/robot-taco.gif';
          }
          // https://github.com/Gillespie59/eslint-plugin-angular/issues/231
          // eslint-disable-next-line angular/on-watch
          $rootScope.$watch('portal.theme', function(newVal, oldVal) {
            if (newVal !== oldVal) {
              vm.mascotImage = newVal.mascotImg || 'img/robot-taco.gif';
            }
          });
        };

        // ////////////////
        // Scope methods //
        // ////////////////
        /**
         * Remove dismissed announcement from scope announcements,
         * then update storage
         * @param {string} id
         */
        vm.markSingleAnnouncementSeen = function(id) {
          // Use $filter to filter out by ID
          vm.announcements = $filter('filterOutMessageWithId')(
            vm.announcements,
            id
          );
          // Notify up the chain so main menu knows about it
          messagesService.broadcastAnnouncementFlag(
            vm.announcements.length > 0
          );
          // Add to seenAnnouncementsIds
          seenAnnouncementIds.push(id);
          // Call service to save results
          messagesService.setMessagesSeen(allSeenMessageIds,
            seenAnnouncementIds, 'dismiss');
          miscService.pushGAEvent('mascot', 'dismissed', id);
        };

        vm.moreInfoButton = function(actionButton) {
          miscService.pushGAEvent('mascot', 'more info', actionButton.url);
        };

        vm.takeButtonAction = function(actionButton) {
          var url = actionButton.url;
          var actionType = 'other';
          var addToHome = 'addToHome';
          if (url.indexOf(addToHome) !== -1) {
              actionType = addToHome;
          }

          miscService.pushGAEvent('mascot', actionType, actionButton.url);

          if (actionType == addToHome) {
            var slash = url.lastIndexOf('/') + 1;
            var fName = url.substr(slash);
            $rootScope.addPortletToHome(fName);
            actionButton.label = 'On your home';
            actionButton.disabled = true;
          }
        };

        /**
         * Add all IDs of unseen announcements to the seenAnnouncements
         * array, then call the messagesService to save results
         */
        vm.markAllAnnouncementsSeen = function() {
          angular.forEach(separatedAnnouncements.unseen, function(value) {
            seenAnnouncementIds.push(value.id);
          });
          messagesService.setMessagesSeen(allSeenMessageIds,
            seenAnnouncementIds, 'dismiss');
        };

        /**
         * Make mascot bobble when hovered
         */
        vm.toggleHover = function() {
          vm.hover = vm.hover ? false : true;
        };

        /**
         * Make mascot appear when clicked
         */
        vm.toggleActive = function() {
          vm.active = !vm.active;
        };

        /**
         * Reset mascot when menu is closed
         */
        $scope.$on('$mdMenuClose', function() {
          vm.hover = false;
          vm.active = false;
        });
      }])

    .controller('FeaturesPageController', ['$scope', '$q',
      '$log', 'messagesService', 'MISC_URLS',
      function($scope, $q, $log, messagesService, MISC_URLS) {
        var vm = this;

        vm.announcements = [];
        vm.MISC_URLS = MISC_URLS;

        // Promise to get seen message IDs
        var promiseSeenMessageIds = {
          seenMessageIds: messagesService.getSeenMessageIds(),
        };

        // //////////////////
        // Event listeners //
        // //////////////////
        /**
         * When the parent controller has messages, initialize
         * things dependent on messages
         */
        $scope.$watch('$parent.hasMessages', function(hasMessages) {
          // If the parent scope has messages and notifications are enabled,
          // complete initialization
          if (hasMessages) {
            if ($scope.$parent.messages.announcements) {
              vm.announcements = $scope.$parent.messages.announcements;

              // Notify service there are no more announcements to see
              messagesService.broadcastAnnouncementFlag(false);

              $q.all(promiseSeenMessageIds)
                .then(getSeenMessageIdsSuccess)
                .catch(function() {
                  $log.log('Problem getting seen IDs on features page');
                });
            }
          }
        });

        /**
         * Get seen message IDs, then mark all announcements seen
         * @param {Object} result - Data returned by promises
         */
        var getSeenMessageIdsSuccess = function(result) {
          var originalSeenMessageIds = [];
          var newSeenMessageIds = [];

          // Set already-seen messages if any exist
          if (result.seenMessageIds && angular.isArray(result.seenMessageIds)
            && result.seenMessageIds.length > 0) {
            // Save all seenMessageIds for later
            originalSeenMessageIds = result.seenMessageIds;
          }

          // Add IDs of all announcements to seen array
          angular.forEach(vm.announcements, function(value) {
            newSeenMessageIds.push(value.id);
          });

          // Mark all announcements seen
          messagesService.setMessagesSeen(originalSeenMessageIds,
            newSeenMessageIds, 'dismiss');
        };
    }]);
});
