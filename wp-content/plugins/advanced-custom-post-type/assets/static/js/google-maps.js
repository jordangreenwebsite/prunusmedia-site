
const DEFAULT_LAT = 51.505;
const DEFAULT_LNG = -0.09;
const DEFAULT_CITY = 'London';

async function initAutocomplete() {

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
     * @return {v|D}
     */
    const coordinates = (lat, lng) => {
        return new google.maps.LatLng(lat, lng);
    };

    /**
     *
     * @param url
     * @return {{scaledSize: AtRule.Size | ParseState.Size, size: AtRule.Size | ParseState.Size, origin: (Point|p|*|k), anchor: (Point|p|*|k), url: *}}
     */
    const createIcon = (url) => {
        return {
            url: url,
            size: new google.maps.Size(71, 71),
            origin: new google.maps.Point(0, 0),
            anchor: new google.maps.Point(17, 34),
            scaledSize: new google.maps.Size(25, 25),
        }
    };

    /**
     *
     * @param map
     * @param position
     * @param icon
     * @param title
     * @return {Property.Marker | s}
     */
    const addPointOnMap = (map, position, icon = null, title = null) => {
        return new google.maps.Marker({
            map,
            icon: createIcon(icon ? icon : 'https://maps.gstatic.com/mapfiles/place_api/icons/v1/png_71/geocode-71.png'),
            position: position,
            title: title
        });
    };

    // loop
    const mapPreviews = document.getElementsByClassName( "acpt_map_preview" );
    for ( let i = 0; i < mapPreviews.length; i++) {

        const mapPreview = mapPreviews.item(i);
        const mapPreviewId = mapPreview.getAttribute('id');
        const searchBoxId = mapPreviewId.slice(0, -4);
        const searchBoxLat = searchBoxId + "_lat";
        const searchBoxLng = searchBoxId + "_lng";
        const searchBoxCity = searchBoxId + "_city";

        const latSelector = document.getElementById(searchBoxLat);
        const lngSelector = document.getElementById(searchBoxLng);
        const citySelector = document.getElementById(searchBoxCity);
        const mapPreviewIdSelector = document.getElementById(mapPreviewId);
        const searchBoxIdSelector = document.getElementById(searchBoxId);

        let defaultLat = (latSelector.value !== '') ? latSelector.value : DEFAULT_LAT;
        let defaultLng = (lngSelector.value !== '') ? lngSelector.value : DEFAULT_LNG;
        let defaultCity = citySelector.value ? citySelector.value : DEFAULT_CITY;

        // if there is a default value but not the coordinates, autosubmit the search
        if (searchBoxIdSelector.value && !latSelector.value && !lngSelector.value) {
            const fAddress = await fetchAddress(searchBoxIdSelector.value);

            if (fAddress.length > 0) {
                defaultLat = fAddress[0].lat;
                defaultLng = fAddress[0].lon;
            }
        }

        const map = new google.maps.Map(mapPreviewIdSelector, {
            center: { lat: parseFloat(defaultLat), lng: parseFloat(defaultLng) },
            zoom: 18,
            mapTypeId: "roadmap",
        });

        if(typeof map.center !== 'undefined'){

            mapPreview.classList.remove('loading');

            // Create the search box and link it to the UI element.
            const input = searchBoxIdSelector;
            const searchBox = new google.maps.places.SearchBox(input);

            map.controls[google.maps.ControlPosition.TOP_LEFT].push(input);

            // Bias the SearchBox results towards current map's viewport.
            map.addListener("bounds_changed", () => {
                searchBox.setBounds(map.getBounds());
            });

            // Add the default marker
            let defaultMarker = addPointOnMap(map, coordinates(defaultLat, defaultLng));
            defaultMarker.setMap(map);

            let markers = [];

            // Listen for the event fired when the user selects a prediction and retrieve
            // more details for that place.
            searchBox.addListener("places_changed", () => {

                const places = searchBox.getPlaces();

                if (places.length === 0) {
                    return;
                }
                // Clear out the old markers.
                markers.forEach((marker) => {
                    marker.setMap(null);
                });
                markers = [];
                // For each place, get the icon, name and location.
                const bounds = new google.maps.LatLngBounds();
                places.forEach((place) => {
                    if (!place.geometry || !place.geometry.location) {
                        console.log("Returned place contains no geometry");
                        return;
                    }

                    // Create a marker for each place.
                    markers.push(addPointOnMap(map, place.geometry.location, place.icon, place.name));

                    if (place.geometry.viewport) {
                        // Only geocodes have viewport.
                        bounds.union(place.geometry.viewport);
                    } else {
                        bounds.extend(place.geometry.location);
                    }

                    // save coordinates and the city
                    latSelector.value =  (searchBoxIdSelector.value !== '') ? place.geometry.location.lat() : null;
                    lngSelector.value =  (searchBoxIdSelector.value !== '') ? place.geometry.location.lng() : null;
                    citySelector.value = (place.address_components && place.address_components.length > 0) ? place.address_components[1].long_name : null;
                });

                map.fitBounds(bounds);
            });

            // listen on reset map
            document.addEventListener("acpt-reset-map", function(e){
                if(e.detail.fieldId === mapPreviewId){
                    console.log(`Resetting map ${mapPreviewId}...`);

                    const center = coordinates(DEFAULT_LAT, DEFAULT_LNG);

                    defaultMarker.setMap(null);
                    defaultMarker = addPointOnMap(map, center);
                    defaultMarker.setMap(map);

                    map.panTo(center);
                }
            });

        } else {
            mapPreviewIdSelector.innerHTML = "Please refresh the page to see the map.";
        }
    }
}