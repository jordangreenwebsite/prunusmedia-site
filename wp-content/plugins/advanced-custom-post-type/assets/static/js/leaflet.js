
const DEFAULT_LAT = 51.505;
const DEFAULT_LNG = -0.09;
const DEFAULT_CITY = 'London';

window.onload = function () {

    /**
     * Check if map is initialized
     *
     * @param el
     * @return {boolean}
     */
    const mapIsInitialized = (el) => {
        var container = L.DomUtil.get(el);

        return container && container['_leaflet_id'] != null;
    };

    /**
     * Extract city from address object
     *
     * @param address
     * @return {*}
     */
    const extractCity = (address) => {

        if(address.city){
            return address.city;
        }

        if(address.town){
            return address.town;
        }

        return address.county;
    };

    /**
     * Run the map rendering
     */
    async function run() {

        // check leaflet is initialized
        if (typeof L === 'object') {

            /**
             *
             * @param address
             * @return {Promise<any>}
             */
            const fetchAddress = async(address) => {

                const response = await fetch(
                    `https://nominatim.openstreetmap.org/search?q=${address}&format=json`,
                    {
                        headers: {
                            'User-Agent': 'advanced-custom-post-type'
                        }
                    }
                );

                return await response.json();
            };

            /**
             *
             * @param lat
             * @param lng
             * @return {Promise<any>}
             */
            const fetchCoordinates = async(lat, lng) => {

                const response = await fetch(
                    `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
                    {
                        headers: {
                            'User-Agent': 'advanced-custom-post-type'
                        }
                    }
                );

                return await response.json();
            };

            const mapPreviews = document.getElementsByClassName("acpt_map_preview");

            for (let i = 0; i < mapPreviews.length; i++) {

                const mapPreview = mapPreviews.item(i);
                const mapPreviewId = mapPreview.getAttribute('id');
                const searchBoxId = mapPreviewId.slice(0, -4);
                const searchBoxLat = searchBoxId + "_lat";
                const searchBoxLng = searchBoxId + "_lng";
                const searchBoxCity = searchBoxId + "_city";

                const searchInput = document.getElementById(searchBoxId);
                const latInput = document.getElementById(searchBoxLat);
                const lngInput = document.getElementById(searchBoxLng);
                const cityInput = document.getElementById(searchBoxCity);

                // User is manually typing an address
                searchInput.addEventListener("input", function () {
                    latInput.value = '';
                    lngInput.value = '';
                    cityInput.value = '';
                });

                let defaultLat = latInput.value ? latInput.value : DEFAULT_LAT;
                let defaultLng = lngInput.value ? lngInput.value : DEFAULT_LNG;
                let defaultCity = cityInput.value ? cityInput.value : DEFAULT_CITY;

                if (!mapIsInitialized(mapPreviewId)) {

                    // if there is a default value but not the coordinates, fetch fetch the coordinates from the address
                    if (searchInput.value && !latInput.value && !lngInput.value) {

                        const fAddress = await fetchAddress(searchInput.value);

                        if (fAddress.length > 0) {
                            defaultLat = fAddress[0].lat;
                            defaultLng = fAddress[0].lon;
                        }
                    }

                    const map = L.map(mapPreviewId).setView([defaultLat, defaultLng], 17);

                    let marker = null;

                    mapPreview.classList.remove('loading');

                    L.tileLayer('//{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
                    marker = L.marker([defaultLat, defaultLng]).addTo(map);
                    marker.bindPopup(searchInput.value).openPopup();

                    const search = new GeoSearch.GeoSearchControl({
                        provider: new GeoSearch.OpenStreetMapProvider(),
                        style: 'bar',
                        keepResult: true,
                        searchLabel: 'Type the address or point a location on the map'
                    });

                    map.addControl(search);

                    /**
                     * Search handler
                     * @param result
                     */
                    async function searchEventHandler(result) {

                        if (marker !== null) {
                            map.removeLayer(marker);
                        }

                        const fCoordinates = await fetchCoordinates(result.location.y, result.location.x);

                        searchInput.value = (search.searchElement && search.searchElement.input) ? search.searchElement.input.value : result.location.label;
                        latInput.value = result.location.y;
                        lngInput.value = result.location.x;
                        cityInput.value = extractCity(fCoordinates.address);

                        result.marker.bindPopup(searchInput.value).openPopup();
                    }

                    /**
                     * On click event handler
                     * @param event
                     */
                    async function onClickEventHandler(event) {
                        if (event.type === 'click') {

                            // remove any other marker first
                            let index = 0;
                            map.eachLayer(function (layer) {
                                if (index !== 0) {
                                    map.removeLayer(layer);
                                }

                                index++;
                            });

                            const coordinates = [event.latlng.lat, event.latlng.lng];
                            const fCoordinates = await fetchCoordinates(coordinates[0], coordinates[1]);

                            searchInput.value = fCoordinates.display_name;
                            latInput.value = coordinates[0];
                            lngInput.value = coordinates[1];
                            cityInput.value = extractCity(fCoordinates.address);

                            if (marker !== null) {
                                map.removeLayer(marker);
                            }

                            marker = L.marker(coordinates).addTo(map);
                            marker.bindPopup(fCoordinates.display_name).openPopup();
                            map.flyTo(coordinates);
                        }
                    }

                    map.on('geosearch/showlocation', searchEventHandler);
                    map.on('click', onClickEventHandler);

                    // listen on reset map
                    document.addEventListener("acpt-reset-map", function (e) {
                        if (e.detail.fieldId === mapPreviewId) {
                            console.log(`Resetting map ${mapPreviewId}...`);

                            // remove any other marker first
                            let index = 0;
                            map.eachLayer(function (layer) {
                                if (index !== 0) {
                                    map.removeLayer(layer);
                                }

                                index++;
                            });

                            map.flyTo([DEFAULT_LAT, DEFAULT_LNG]);
                            marker = L.marker([DEFAULT_LAT, DEFAULT_LNG]).addTo(map);
                        }
                    });
                }
            }
        }
    }

    document.addEventListener("acpt_grouped_element_added", (e) => {
        run();
    });

    document.addEventListener("acpt_flexible_element_added", (e) => {
        run();
    });

    run();
};