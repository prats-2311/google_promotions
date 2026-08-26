"""Synthetic BigQuery row fixtures for all 5 supported cities.

Pure and deterministic (no randomness, no clock reads) so the same call
always returns the same dict -- test_bigquery_routes.py only ever exercised
mumbai row shapes before this existed, so nothing caught a bug specific to
another city's data (e.g. non-ASCII handling, empty-array fields).
"""

SUPPORTED_CITY_IDS: list[str] = ["mumbai", "london", "tokyo", "sao_paulo", "new_york"]

def culture_notes_row(city_id: str) -> dict[str, str | list[str]]:
    if city_id not in SUPPORTED_CITY_IDS:
        raise ValueError(f"unknown city_id: {city_id}")
    
    data: dict[str, dict[str, str | list[str]]] = {
        "mumbai": {
            "etiquette_notes": "Remove shoes before entering homes and temples; respect elders by using 'ji' suffix.",
            "greeting_style": "Namaste with folded hands, often accompanied by a slight bow.",
            "media_behavior_notes": "Highly engaged with regional cinema and cricket broadcasts; lively social media debates.",
            "fan_interaction_style": "Enthusiastic but respectful, often gathering in large groups for street viewings.",
            "dos": ["Carry small change for street vendors", "Dress modestly at religious sites", "Learn basic Hindi or local phrases"],
            "donts": ["Public displays of affection", "Photograph military installations", "Refuse offered tea rudely"],
            "humor_boundaries": "Avoid sarcasm about family honor or religious practices; light-hearted puns are welcome."
        },
        "london": {
            "etiquette_notes": "Queue patiently for everything; 'please' and 'thank you' are mandatory social lubricants.",
            "greeting_style": "A firm handshake or casual 'how's it going?' with minimal physical contact.",
            "media_behavior_notes": "Cultivated taste in theatre and independent film; measured social media commentary.",
            "fan_interaction_style": "Reserved but appreciative, often engaging in witty banter rather than loud cheering.",
            "dos": ["Tipping 10-15% at restaurants", "Reserve theatre tickets in advance", "Keep voices down on public transport"],
            "donts": ["Discuss politics or religion aggressively", "Cut in line under any circumstances", "Assume everyone drinks tea"],
            "humor_boundaries": "Dry wit and self-deprecation are appreciated; avoid overly loud or slapstick comedy."
        },
        "tokyo": {
            "etiquette_notes": "Bow slightly when greeting; handle business cards with both hands and read them carefully.",
            "greeting_style": "A polite bow, often accompanied by a soft 'konnichiwa' or 'ohayou gozaimasu'.",
            "media_behavior_notes": "Highly organized fan clubs; strict adherence to concert rules and silence during performances.",
            "fan_interaction_style": "Quietly devoted, often collecting official merchandise and respecting personal space.",
            "dos": ["Remove shoes indoors", "Tap credit cards on readers", "Carry a small towel for wiping hands"],
            "donts": ["Blow your nose in public", "Eat while walking", "Point with your finger"],
            "humor_boundaries": "Subtle humor and situational comedy are preferred; avoid loud or disruptive joking."
        },
        "sao_paulo": {
            "etiquette_notes": "Warm physical greetings like cheek kisses are standard; punctuality is flexible for social events.",
            "greeting_style": "Um beijo no rosto or abraço, accompanied by lively conversation and close proximity.",
            "media_behavior_notes": "Passionate about football and samba; vibrant, expressive social media engagement.",
            "fan_interaction_style": "Outspoken and affectionate, often hugging performers and sharing food during gatherings.",
            "dos": ["Arrive fashionably late to parties", "Try local pastéis and caipirinhas", "Dance freely at celebrations"],
            "donts": ["Be overly formal or stiff", "Refuse a drink offered by a host", "Discuss football rivalries aggressively"],
            "humor_boundaries": "Playful teasing and rhythmic jokes are common; avoid serious or morbid topics."
        },
        "new_york": {
            "etiquette_notes": "Walk fast and keep to the right on sidewalks; 'sorry' is used even when you bump into someone.",
            "greeting_style": "A quick 'hey' or 'what's up?' with a nod or brief handshake; efficiency is key.",
            "media_behavior_notes": "Fast-paced, opinionated, and highly connected; trends spread rapidly across boroughs.",
            "fan_interaction_style": "Direct and energetic, often approaching performers with quick questions or photo requests.",
            "dos": ["Tip generously (18-20%)", "Use subway maps efficiently", "Carry a reusable coffee cup"],
            "donts": ["Block subway doors", "Make eye contact too long on public transit", "Assume everyone speaks English fluently"],
            "humor_boundaries": "Fast-paced, observational, and slightly cynical humor works best; avoid overly sentimental jokes."
        }
    }
    
    row: dict[str, str | list[str]] = {"city_id": city_id}
    row.update(data[city_id])
    return row

def fan_signals_row(city_id: str, genre: str = "pop", artist_type: str = "musician") -> dict[str, str | float]:
    if city_id not in SUPPORTED_CITY_IDS:
        raise ValueError(f"unknown city_id: {city_id}")
        
    data: dict[str, dict[str, str | float]] = {
        "mumbai": {
            "enthusiasm_score": 85.5,
            "fan_behavior_style": "Large, organized gatherings with synchronized cheering and coordinated light displays.",
            "city_importance_tier": "Tier 1",
            "genre_affinity_notes": "Strong crossover appeal between regional cinema soundtracks and mainstream pop.",
            "signal_basis": "High ticket resale velocity and sustained social media trending duration."
        },
        "london": {
            "enthusiasm_score": 72.3,
            "fan_behavior_style": "Measured engagement with curated playlist sharing and respectful queueing for events.",
            "city_importance_tier": "Tier 1",
            "genre_affinity_notes": "Deep appreciation for live instrumentation and independent label releases.",
            "signal_basis": "Consistent streaming retention rates and high concert attendance stability."
        },
        "tokyo": {
            "enthusiasm_score": 94.8,
            "fan_behavior_style": "Highly disciplined participation with strict adherence to event protocols and merchandise collecting.",
            "city_importance_tier": "Tier 1",
            "genre_affinity_notes": "Exceptional loyalty to specific artist eras and limited edition physical media.",
            "signal_basis": "Rapid sell-out rates for physical albums and high engagement on official fan forums."
        },
        "sao_paulo": {
            "enthusiasm_score": 91.2,
            "fan_behavior_style": "Vibrant, expressive crowds with spontaneous dancing and strong community sharing.",
            "city_importance_tier": "Tier 2",
            "genre_affinity_notes": "Natural synergy with rhythmic genres and high demand for live acoustic sets.",
            "signal_basis": "High social media share rates and strong word-of-mouth event promotion."
        },
        "new_york": {
            "enthusiasm_score": 78.9,
            "fan_behavior_style": "Fast-moving, direct interactions with quick photo requests and efficient crowd navigation.",
            "city_importance_tier": "Tier 1",
            "genre_affinity_notes": "Broad genre adaptability with high demand for remix culture and DJ sets.",
            "signal_basis": "Rapid ticket sales velocity and high cross-platform streaming activity."
        }
    }
    
    row: dict[str, str | float] = {"city_id": city_id, "genre": genre, "artist_type": artist_type}
    row.update(data[city_id])
    return row

def local_delight_row(city_id: str) -> dict[str, str | list[dict[str, str]] | list[str]]:
    if city_id not in SUPPORTED_CITY_IDS:
        raise ValueError(f"unknown city_id: {city_id}")
        
    data: dict[str, dict[str, str | list[dict[str, str]] | list[str]]] = {
        "mumbai": {
            "local_phrases": [
                {"phrase": "Namaste", "phonetic": "nuh-muh-stay", "meaning": "I bow to the divine in you", "usage_context": "Greeting elders or entering sacred spaces"},
                {"phrase": "Shukriya", "phonetic": "shook-ree-yuh", "meaning": "Thank you", "usage_context": "Polite exchange with service staff"}
            ],
            "cultural_references": ["a vibrant street food culture", "a bustling Bollywood film industry"],
            "beloved_icons": [
                {"name": "a veteran playback singer", "domain": "music", "reference_note": "known for decades of chart-topping ballads"},
                {"name": "a legendary street food vendor", "domain": "culinary", "reference_note": "famous for generations-old spice blends"}
            ],
            "crowd_moment_suggestions": ["Organize a flash mob to a classic film song", "Host a neighborhood cricket viewing party with commentary"],
            "music_or_remix_ideas": ["Blend traditional tabla rhythms with electronic beats", "Sample old radio jingles for lo-fi hip hop"]
        },
        "london": {
            "local_phrases": [
                {"phrase": "Cheers", "phonetic": "cheers", "meaning": "Thank you or goodbye", "usage_context": "Casual social exchange"},
                {"phrase": "Innit", "phonetic": "in-it", "meaning": "Isn't it?", "usage_context": "Seeking agreement in conversation"}
            ],
            "cultural_references": ["a historic theatre district", "a globally influential music scene"],
            "beloved_icons": [
                {"name": "a seasoned West End director", "domain": "theatre", "reference_note": "renowned for reviving classic plays"},
                {"name": "a beloved pub landlord", "domain": "hospitality", "reference_note": "known for hosting local trivia nights"}
            ],
            "crowd_moment_suggestions": ["Stage a silent disco in a historic square", "Organize a book swap at a famous library"],
            "music_or_remix_ideas": ["Fuse classical string arrangements with drum and bass", "Sample vintage BBC radio broadcasts for ambient tracks"]
        },
        "tokyo": {
            "local_phrases": [
                {"phrase": "Arigatou gozaimasu", "phonetic": "ah-ree-gah-toh goh-zah-ee-mahs", "meaning": "Thank you (polite)", "usage_context": "Expressing gratitude to staff or seniors"},
                {"phrase": "Otsukaresama desu", "phonetic": "oh-tsoo-kah-reh-sahm deh-soo", "meaning": "Good work / Thank you for your effort", "usage_context": "Standard workplace greeting"}
            ],
            "cultural_references": ["a highly organized fan culture", "a rich tradition of seasonal festivals"],
            "beloved_icons": [
                {"name": "a master of traditional koto music", "domain": "music", "reference_note": "preserves centuries-old compositions"},
                {"name": "a renowned sushi chef", "domain": "culinary", "reference_note": "known for decades of meticulous craftsmanship"}
            ],
            "crowd_moment_suggestions": ["Host a lantern lighting ceremony in a public park", "Organize a silent reading event at a famous bookstore"],
            "music_or_remix_ideas": ["Mix shamisen melodies with synthwave", "Sample temple bell recordings for ambient loops"]
        },
        "sao_paulo": {
            "local_phrases": [
                {"phrase": "Obrigado", "phonetic": "oh-bree-gah-doo", "meaning": "Thank you (male speaker)", "usage_context": "General polite expression"},
                {"phrase": "Tudo bem?", "phonetic": "too-doo bem", "meaning": "How are you? / Everything okay?", "usage_context": "Casual greeting among friends"}
            ],
            "cultural_references": ["a passionate football culture", "a vibrant street art scene"],
            "beloved_icons": [
                {"name": "a legendary samba school director", "domain": "dance", "reference_note": "known for elaborate parade choreography"},
                {"name": "a beloved street food cart owner", "domain": "culinary", "reference_note": "famous for authentic feijoada recipes"}
            ],
            "crowd_moment_suggestions": ["Organize a street carnival parade with homemade floats", "Host a neighborhood football tournament with live music"],
            "music_or_remix_ideas": ["Fuse bossa nova guitar lines with house beats", "Sample carnival drum marches for electronic drops"]
        },
        "new_york": {
            "local_phrases": [
                {"phrase": "Fuhgeddaboudit", "phonetic": "fuh-GEH-duh-bow-dit", "meaning": "Forget about it / no worries", "usage_context": "Classic borough slang, dismissive or reassuring"},
                {"phrase": "Whattaya say", "phonetic": "WUH-duh-yuh-say", "meaning": "Casual greeting / how's it going", "usage_context": "Quick street-corner hello"}
            ],
            "cultural_references": ["a dynamic jazz heritage", "a globally influential fashion week"],
            "beloved_icons": [
                {"name": "a veteran jazz bassist", "domain": "music", "reference_note": "known for decades of late-night club performances"},
                {"name": "a beloved bodega owner", "domain": "community", "reference_note": "known for decades of serving regulars"}
            ],
            "crowd_moment_suggestions": ["Organize a flash mob in a busy subway station", "Host a rooftop poetry slam overlooking the skyline"],
            "music_or_remix_ideas": ["Blend subway train sounds with hip hop beats", "Sample vintage Broadway recordings for neo-soul"]
        }
    }
    
    row: dict[str, str | list[dict[str, str]] | list[str]] = {"city_id": city_id}
    row.update(data[city_id])
    return row