/*
Copyright 2017 The Nuclio Authors.
Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at
    http://www.apache.org/licenses/LICENSE-2.0
Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/
(function () {
    'use strict';

    angular.module('nuclio.app')
        .factory('NuclioNamespacesDataService', NuclioNamespacesDataService);

    function NuclioNamespacesDataService($i18next, i18next, NuclioClientService, DialogsService, lodash) {

        var service = {
            getNamespaces: getNamespaces,
            getNamespace: getNamespace,
            getNamespaceHeader: getNamespaceHeader,
            initNamespaceData: initNamespaceData,
            namespaceData: {
                namespaces: [],
                namespacesExist: false,
                selectedNamespace: null
            }
        };

        return service;

        //
        // Public methods
        //

        /**
         * Gets all namespaces
         * @returns {Promise}
         */
        function getNamespaces() {
            return NuclioClientService.makeRequest(
                {
                    method: 'GET',
                    url: NuclioClientService.buildUrlWithPath('namespaces', ''),
                    withCredentials: false
                });
        }

        /**
         * Gets all namespace
         * @returns {?string}
         */
        function getNamespace() {
            var namespace = localStorage.getItem('namespace');

            return !lodash.isNil(namespace) && namespace !== '' ? namespace : null;
        }

        /**
         * Gets namespace header
         * @param {string} headerTitle - title of namespace header
         * @returns {Object}
         */
        function getNamespaceHeader(headerTitle) {
            var namespace = service.getNamespace();
            var headerObj = {};

            if (!lodash.isNil(namespace)) {
                headerObj[headerTitle] = namespace;
            }

            return headerObj;
        }

        /**
         * Init namespace data
         * @returns {Promise}
         */
        function initNamespaceData() {
            return service.getNamespaces()
                .then(function (response) {
                    if (lodash.isEmpty(response.namespaces.names)) {
                        localStorage.removeItem('namespace');
                    } else {
                        var namespacesExist = true;
                        var namespaces = lodash.map(response.namespaces.names, function (name) {
                            return {
                                type: 'namespace',
                                id: name,
                                name: name
                            };
                        });
                        var namespaceFromLocalStorage = localStorage.getItem('namespace');

                        var selectedNamespace = lodash.find(namespaces, { name: namespaceFromLocalStorage });
                        if (lodash.isNil(selectedNamespace)) {
                            selectedNamespace = namespaces[0];

                            localStorage.setItem('namespace', selectedNamespace.name);
                        }

                        service.namespaceData = {
                            namespaces: namespaces,
                            namespacesExist: namespacesExist,
                            selectedNamespace: selectedNamespace
                        };
                    }

                    return service.namespaceData;
                })
                .catch(function (error) {
                    if (error.status === 403) {
                        localStorage.removeItem('namespace');

                        // do not show alert message
                        return;
                    }

                    DialogsService.alert($i18next.t('functions:ERROR_MSG.GET_NAMESPACES', { lng: i18next.language }));
                });
        }
    }
}());
