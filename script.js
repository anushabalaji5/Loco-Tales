document.addEventListener('DOMContentLoaded', function () {
    const searchBtn = document.getElementById('search-btn');
    const locationInput = document.getElementById('location-input');
    const categorySelect = document.getElementById('category-select');
    const placesContainer = document.getElementById('places-container');
    const loadingSpinner = document.getElementById('loading-spinner');
    const tabButtons = document.querySelectorAll('.tab-btn');
    const modal = document.getElementById('place-modal');
    const closeModal = document.querySelector('.close-modal');
    const burger = document.querySelector('.burger');
    const navLinks = document.querySelector('.nav-links');
    const header = document.querySelector('header');

    let map;
    let currentPlaces = [];

    initMap(20.5937, 78.9629);

    searchBtn.addEventListener('click', handleSearch);
    locationInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            handleSearch();
        }
    });
    closeModal.addEventListener('click', () => modal.style.display = "none");
    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = "none";
        }
    });
    burger.addEventListener('click', toggleNav);

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            const category = button.dataset.category;
            filterPlaces(category);
        });
    });

    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
    });

    async function fetchLocationCoordinates(location) {
        try {
            const response = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}&limit=1&countrycodes=in`
            );
            const data = await response.json();
            if (data && data.length > 0) {
                return {
                    lat: parseFloat(data[0].lat),
                    lon: parseFloat(data[0].lon),
                    display_name: data[0].display_name
                };
            }
            return null;
        } catch (error) {
            console.error("Error fetching coordinates:", error);
            return null;
        }
    }

    async function fetchNearbyPlaces(lat, lng, category) {
        const radius = 15000; // Increased radius for better results
        let overpassQuery = buildOverpassQuery(lat, lng, radius, category);

        try {
            const response = await fetch('https://overpass-api.de/api/interpreter', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `data=${encodeURIComponent(overpassQuery)}`
            });

            const data = await response.json();
            return await processOverpassData(data.elements || []);
        } catch (error) {
            console.error("Error fetching places:", error);
            return [];
        }
    }

    function buildOverpassQuery(lat, lng, radius, category) {
        let filters;
        switch (category) {
            case 'restaurant':
                filters = `(
                    node["amenity"="restaurant"]["name"](around:${radius},${lat},${lng});
                    node["amenity"="cafe"]["name"](around:${radius},${lat},${lng});
                    node["amenity"="fast_food"]["name"](around:${radius},${lat},${lng});
                    node["amenity"="food_court"]["name"](around:${radius},${lat},${lng});
                )`;
                break;
            case 'hotel':
                filters = `(
                    node["tourism"="hotel"]["name"](around:${radius},${lat},${lng});
                    node["tourism"="guest_house"]["name"](around:${radius},${lat},${lng});
                    node["tourism"="hostel"]["name"](around:${radius},${lat},${lng});
                    node["tourism"="motel"]["name"](around:${radius},${lat},${lng});
                )`;
                break;
            case 'museum':
                filters = `(
                    node["tourism"="museum"]["name"](around:${radius},${lat},${lng});
                    node["amenity"="arts_centre"]["name"](around:${radius},${lat},${lng});
                    node["tourism"="gallery"]["name"](around:${radius},${lat},${lng});
                    node["amenity"="library"]["name"](around:${radius},${lat},${lng});
                )`;
                break;
            case 'beach':
                filters = `(
                    node["name"~"beach", i](around:${radius},${lat},${lng});
                    node["natural"="beach"](around:${radius},${lat},${lng});
                    node["leisure"="beach_resort"](around:${radius},${lat},${lng});
                    node["tourism"="beach"](around:${radius},${lat},${lng});
                )`;
                break;


            case 'attraction':
                filters = `(
                    node["tourism"="attraction"]["name"](around:${radius},${lat},${lng});
                    node["tourism"="monument"]["name"](around:${radius},${lat},${lng});
                    node["tourism"="viewpoint"]["name"](around:${radius},${lat},${lng});
                    node["historic"]["name"](around:${radius},${lat},${lng});
                    node["tourism"="zoo"]["name"](around:${radius},${lat},${lng});
                    node["leisure"="park"]["name"](around:${radius},${lat},${lng});
                    node["amenity"="place_of_worship"]["name"](around:${radius},${lat},${lng});
                    node["tourism"="theme_park"]["name"](around:${radius},${lat},${lng});
                )`;
                break;
            default:
                filters = `(
                    node["tourism"]["name"](around:${radius},${lat},${lng});
                    node["amenity"~"^(restaurant|cafe|museum|place_of_worship|library)$"]["name"](around:${radius},${lat},${lng});
                    node["historic"]["name"](around:${radius},${lat},${lng});
                    node["leisure"~"^(park|garden)$"]["name"](around:${radius},${lat},${lng});
                )`;
        }

        return `[out:json][timeout:30];${filters};out geom;`;
    }

    async function fetchWikipediaSummary(title) {
        try {
            // First try exact match
            let url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
            let response = await fetch(url);
            
            if (!response.ok) {
                // Try with search API for better matching
                const searchUrl = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(title)}&limit=1&namespace=0&format=json&origin=*`;
                const searchResponse = await fetch(searchUrl);
                const searchData = await searchResponse.json();
                
                if (searchData[1] && searchData[1].length > 0) {
                    const pageTitle = searchData[1][0];
                    url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(pageTitle)}`;
                    response = await fetch(url);
                }
            }
            
            if (response.ok) {
                const data = await response.json();
                if (data.extract && data.extract.length > 50) {
                    return data.extract;
                }
            }
            
            return null;
        } catch (error) {
            console.error(`Error fetching Wikipedia for "${title}":`, error);
            return null;
        }
    }

    async function processOverpassData(elements) {
        const places = [];
        const processedNames = new Set(); // Avoid duplicates

        for (const [i, element] of elements.entries()) {
            const tags = element.tags;
            const name = tags.name;
            
            if (!name || processedNames.has(name)) continue;
            processedNames.add(name);

            const category = determineCategory(tags);
            let description = null;
            let detailedDescription = null;

            // Try to get Wikipedia description
            try {
                description = await fetchWikipediaSummary(name);
                
                // If Wikipedia doesn't work, try with location context
                if (!description) {
                    const locationContext = extractLocationContext(tags);
                    if (locationContext) {
                        description = await fetchWikipediaSummary(`${name} ${locationContext}`);
                    }
                }
            } catch (error) {
                console.error(`Error processing ${name}:`, error);
            }

            // Generate specific description based on available tags
            if (!description) {
                description = generateSpecificDescription(name, tags, category);
            }

            // Generate detailed description for modal
            detailedDescription = generateDetailedDescription(name, tags, category, description);

            const place = {
                id: element.id || i,
                name: name,
                category,
                description: description.length > 150 ? description.substring(0, 150) + '...' : description,
                fullDescription: detailedDescription,
                image: getPlaceholderImage(category),
                rating: generateRating(),
                address: formatAddress(tags),
                phone: tags.phone || tags['contact:phone'] || 'Not available',
                website: tags.website || tags['contact:website'] || '#',
                openingHours: tags.opening_hours || 'Hours not available',
                lat: element.lat,
                lon: element.lon,
                tags: tags
            };

            places.push(place);
        }

        return places.slice(0, 25); // Return more places for better variety
    }

    function extractLocationContext(tags) {
        const locations = [];
        if (tags['addr:city']) locations.push(tags['addr:city']);
        if (tags['addr:state']) locations.push(tags['addr:state']);
        if (tags['addr:district']) locations.push(tags['addr:district']);
        return locations.length > 0 ? locations.join(' ') : null;
    }

    function generateSpecificDescription(name, tags, category) {
        let description = '';
        
        // Use specific tags to create detailed descriptions
        switch (category) {
            case 'restaurant':
                description = `${name} is a `;
                if (tags.cuisine) {
                    description += `${tags.cuisine} restaurant `;
                } else {
                    description += 'restaurant ';
                }
                if (tags['addr:city']) {
                    description += `located in ${tags['addr:city']}`;
                }
                if (tags.description) {
                    description += `. ${tags.description}`;
                } else {
                    description += ', offering delicious local and regional cuisine.';
                }
                break;
                
            case 'hotel':
                description = `${name} is a `;
                if (tags.stars) {
                    description += `${tags.stars}-star hotel `;
                } else {
                    description += 'hotel ';
                }
                if (tags['addr:city']) {
                    description += `in ${tags['addr:city']}`;
                }
                if (tags.description) {
                    description += `. ${tags.description}`;
                } else {
                    description += ', providing comfortable accommodation for travelers.';
                }
                break;
                
            case 'museum':
                description = `${name} is a `;
                if (tags.museum) {
                    description += `${tags.museum} museum `;
                } else {
                    description += 'museum ';
                }
                if (tags['addr:city']) {
                    description += `located in ${tags['addr:city']}`;
                }
                if (tags.description) {
                    description += `. ${tags.description}`;
                } else {
                    description += ', showcasing important cultural and historical artifacts.';
                }
                break;
                
            case 'beach':
                description = `${name} is a `;
                if (tags.natural === 'beach') {
                    description += 'natural beach ';
                } else {
                    description += 'beach destination ';
                }
                if (tags['addr:city']) {
                    description += `near ${tags['addr:city']}`;
                }
                if (tags.description) {
                    description += `. ${tags.description}`;
                } else {
                    description += ', perfect for relaxation and water activities.';
                }
                break;
                
            case 'attraction':
                if (tags.historic) {
                    description = `${name} is a historic `;
                    if (tags.historic !== 'yes') {
                        description += `${tags.historic} `;
                    }
                    description += 'site ';
                } else if (tags.tourism === 'monument') {
                    description = `${name} is a monument `;
                } else if (tags.amenity === 'place_of_worship') {
                    description = `${name} is a `;
                    if (tags.religion) {
                        description += `${tags.religion} `;
                    }
                    description += 'place of worship ';
                } else {
                    description = `${name} is a popular attraction `;
                }
                
                if (tags['addr:city']) {
                    description += `in ${tags['addr:city']}`;
                }
                if (tags.description) {
                    description += `. ${tags.description}`;
                } else {
                    description += ', known for its historical and cultural significance.';
                }
                break;
                
            default:
                description = `${name} is an interesting place `;
                if (tags['addr:city']) {
                    description += `in ${tags['addr:city']} `;
                }
                description += 'worth visiting for its unique characteristics.';
        }
        
        return description;
    }

    function generateDetailedDescription(name, tags, category, shortDescription) {
        let detailed = shortDescription;
        
        // Add more details based on available tags
        const additionalInfo = [];
        
        if (tags.architect) additionalInfo.push(`Designed by ${tags.architect}`);
        if (tags.construction_date || tags.start_date) {
            const date = tags.construction_date || tags.start_date;
            additionalInfo.push(`Built in ${date}`);
        }
        if (tags.heritage) additionalInfo.push(`Recognized as a heritage site`);
        if (tags.wikipedia) additionalInfo.push(`Featured on Wikipedia`);
        if (tags.wikidata) additionalInfo.push(`Documented in Wikidata`);
        
        // Category-specific details
        switch (category) {
            case 'restaurant':
                if (tags.outdoor_seating) additionalInfo.push(`Features outdoor seating`);
                if (tags.delivery) additionalInfo.push(`Offers delivery service`);
                if (tags.takeaway) additionalInfo.push(`Takeaway available`);
                if (tags.diet_vegetarian) additionalInfo.push(`Vegetarian options available`);
                break;
                
            case 'hotel':
                if (tags.rooms) additionalInfo.push(`Features ${tags.rooms} rooms`);
                if (tags.internet_access) additionalInfo.push(`Internet access available`);
                if (tags.swimming_pool) additionalInfo.push(`Swimming pool available`);
                if (tags.parking) additionalInfo.push(`Parking facilities available`);
                break;
                
            case 'museum':
                if (tags.fee) additionalInfo.push(`Entry fee required`);
                if (tags.wheelchair) additionalInfo.push(`Wheelchair accessible`);
                break;
                
            case 'attraction':
                if (tags.fee) additionalInfo.push(`Entry fee may apply`);
                if (tags.wheelchair) additionalInfo.push(`Wheelchair accessible`);
                if (tags.tourism === 'viewpoint') additionalInfo.push(`Offers scenic views`);
                break;
        }
        
        if (additionalInfo.length > 0) {
            detailed += ' ' + additionalInfo.join('. ') + '.';
        }
        
        return detailed;
    }

    function determineCategory(tags) {
        if (tags.amenity === 'restaurant' || tags.amenity === 'cafe' || tags.amenity === 'fast_food' || tags.amenity === 'food_court') return 'restaurant';
        if (tags.tourism === 'hotel' || tags.tourism === 'guest_house' || tags.tourism === 'hostel' || tags.tourism === 'motel') return 'hotel';
        if (tags.tourism === 'museum' || tags.amenity === 'arts_centre' || tags.tourism === 'gallery' || tags.amenity === 'library') return 'museum';
        if (tags.natural === 'beach' || tags.leisure === 'beach_resort' || tags.tourism === 'beach') return 'beach';
        if (tags.tourism === 'attraction' || tags.tourism === 'monument' || tags.historic || tags.tourism === 'viewpoint' || tags.tourism === 'zoo' || tags.amenity === 'place_of_worship' || tags.tourism === 'theme_park') return 'attraction';
        return 'attraction';
    }

    function formatAddress(tags) {
        const parts = [];
        if (tags['addr:house_number']) parts.push(tags['addr:house_number']);
        if (tags['addr:street']) parts.push(tags['addr:street']);
        if (tags['addr:suburb']) parts.push(tags['addr:suburb']);
        if (tags['addr:city']) parts.push(tags['addr:city']);
        if (tags['addr:state']) parts.push(tags['addr:state']);
        if (tags['addr:postcode']) parts.push(tags['addr:postcode']);
        
        if (parts.length === 0 && tags.addr) parts.push(tags.addr);
        return parts.join(', ') || 'Address not available';
    }

    function getPlaceholderImage(category) {
        const images = {
            restaurant: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1000&q=80',
            hotel: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1000&q=80',
            museum: 'https://images.unsplash.com/photo-1536599424071-0b215a388ba7?auto=format&fit=crop&w=1000&q=80',
            beach: 'https://images.unsplash.com/photo-1505228395891-9a51e7e86bf6?auto=format&fit=crop&w=1000&q=80',
            attraction: 'https://images.unsplash.com/photo-1501594907352-04cda38ebc29?auto=format&fit=crop&w=1000&q=80'
        };
        return images[category] || images.attraction;
    }

    function generateRating() {
        return Math.floor(Math.random() * 2) + 3.5; // 3.5 to 4.5 rating
    }

    async function handleSearch() {
        const location = locationInput.value.trim();
        const category = categorySelect.value;

        if (!location) {
            alert('Please enter a location to search');
            return;
        }

        loadingSpinner.style.display = "flex";
        placesContainer.innerHTML = "";

        try {
            const coords = await fetchLocationCoordinates(location);
            if (!coords) throw new Error('Location not found');

            if (map) {
                map.setView([coords.lat, coords.lon], 12);
                map.eachLayer(layer => {
                    if (layer instanceof L.Marker) {
                        map.removeLayer(layer);
                    }
                });
            }

            const places = await fetchNearbyPlaces(coords.lat, coords.lon, category);

            if (places.length === 0) {
                placesContainer.innerHTML = '<p class="no-results">No places found for this location. Try a different search or expand your search area.</p>';
            } else {
                currentPlaces = places;
                displayPlaces(places);
                places.forEach(place => {
                    if (place.lat && place.lon) {
                        L.marker([place.lat, place.lon])
                            .addTo(map)
                            .bindPopup(`<b>${place.name}</b><br>${place.description}`);
                    }
                });
            }

            document.getElementById('explore').scrollIntoView({ behavior: 'smooth' });

        } catch (error) {
            console.error('Search error:', error);
            placesContainer.innerHTML = `<p class="no-results">Error: ${error.message}. Please try again.</p>`;
        } finally {
            loadingSpinner.style.display = "none";
        }
    }

    function displayPlaces(places) {
        placesContainer.innerHTML = "";
        if (places.length === 0) {
            placesContainer.innerHTML = '<p class="no-results">No places found. Try a different search.</p>';
            return;
        }

        places.forEach(place => {
            const placeCard = document.createElement('div');
            placeCard.className = 'place-card';
            placeCard.innerHTML = `
                <img src="${place.image}" alt="${place.name}" class="place-image">
                <div class="place-info">
                    <span class="place-category">${capitalizeFirstLetter(place.category)}</span>
                    <h3 class="place-name">${place.name}</h3>
                    <p class="place-description">${place.description}</p>
                    <div class="place-rating">${getRatingStars(place.rating)}</div>
                    <button class="view-btn" data-id="${place.id}">View Details</button>
                    <a href="https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lon}" target="_blank" class="location-btn">Location</a>
                </div>
            `;
            placesContainer.appendChild(placeCard);
        });

        document.querySelectorAll('.view-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const placeId = e.target.dataset.id;
                const place = currentPlaces.find(p => p.id == placeId);
                if (place) openPlaceModal(place);
            });
        });
    }

    function filterPlaces(category) {
        if (!currentPlaces.length) return;
        if (category === 'all') {
            displayPlaces(currentPlaces);
            return;
        }
        const filteredPlaces = currentPlaces.filter(place => place.category === category);
        displayPlaces(filteredPlaces);
    }

    function openPlaceModal(place) {
        // Set modal content
        document.getElementById('modal-place-name').textContent = place.name;
        document.getElementById('modal-place-image').src = place.image;

        // Use full description for modal
        document.getElementById('modal-place-description').textContent = place.fullDescription || place.description;
        document.getElementById('modal-place-address').textContent = place.address;
        document.getElementById('modal-place-phone').textContent = place.phone;

        // Set website
        const websiteLink = document.getElementById('modal-place-website');
        if (place.website && place.website !== '#') {
            websiteLink.href = place.website;
            websiteLink.style.display = 'inline';
        } else {
            websiteLink.style.display = 'none';
        }

        // Set rating stars
        document.getElementById('modal-place-rating').innerHTML = getRatingStars(place.rating);

        // Set Google Maps link for "Get Directions"
        const directionsBtn = document.getElementById('directions-btn');
        directionsBtn.href = `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lon}`;

        // Set up audio for history
        document.getElementById('play-audio-btn').onclick = function () {
            const textToSpeak = place.fullDescription || place.description;
            const utterance = new SpeechSynthesisUtterance(textToSpeak);
            utterance.lang = 'en-IN';
            utterance.rate = 0.9;
            utterance.pitch = 1;
            speechSynthesis.cancel();
            speechSynthesis.speak(utterance);
        };

        // Show the modal
        modal.style.display = "block";
    }

    function getRatingStars(rating) {
        let stars = '';
        for (let i = 1; i <= 5; i++) {
            if (i <= rating) {
                stars += '<i class="fas fa-star"></i>';
            } else if (i - 0.5 <= rating) {
                stars += '<i class="fas fa-star-half-alt"></i>';
            } else {
                stars += '<i class="far fa-star"></i>';
            }
        }
        return stars;
    }

    function capitalizeFirstLetter(string) {
        return string.charAt(0).toUpperCase() + string.slice(1);
    }

    function toggleNav() {
        navLinks.classList.toggle('active');
        burger.classList.toggle('toggle');
    }

    function initMap(lat, lng) {
        if (map) map.remove();
        map = L.map("map").setView([lat, lng], 6);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: '&copy; OpenStreetMap contributors',
        }).addTo(map);
    }

    async function loadInitialPlaces() {
        const popularIndianCities = ['Mumbai', 'Delhi', 'Bangalore', 'Chennai', 'Kolkata', 'Hyderabad', 'Pune', 'Jaipur'];
        const randomCity = popularIndianCities[Math.floor(Math.random() * popularIndianCities.length)];
        locationInput.value = randomCity;
        placesContainer.innerHTML = '<p class="no-results">Enter a location and click "Explore" to find amazing places with detailed information!</p>';
    }

    loadInitialPlaces();
});