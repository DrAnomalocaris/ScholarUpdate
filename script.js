document.addEventListener("DOMContentLoaded", function () {
    const apiKeyInput = document.getElementById("apiKey");
    const topicInput = document.getElementById("topic");
    const daysInput = document.getElementById("days");
    const searchButton = document.getElementById("searchButton");
    const settingsButton = document.getElementById("settingsButton");
    const resultsDiv = document.getElementById("results");
    const settingsContent = document.querySelector(".settings-content");
    const ncbiCheckbox = document.getElementById("ncbiCheckbox");
    const crossRefCheckbox = document.getElementById("crossRefCheckbox");
    const arxivCheckbox = document.getElementById("arxivCheckbox");
    const onlyReviewsCheckbox = document.getElementById("onlyReviewsCheckbox"); // New checkbox for reviews
    const gptEngineSelect = document.getElementById("gptEngine");
    const customPromptTextarea = document.getElementById("customPrompt");
    const resetPromptButton = document.getElementById("resetPromptButton");

    // Updated default prompt
    const defaultPrompt = `Provide a comprehensive summary of the recent developments in {{topic}} based on the following articles. 

Include key trends, findings, and significant advancements. 

Present the summary in HTML format, with hyperlinks to the articles. 

Highlight complex or less commonly understood technical terms, proteins, cell types, or pathways using <span class="wiki-link" data-explanation="explanation_here"></span> tags, and provide brief explanations for them.  

Use cards formatting and other html tools to make the article elegant and modern. keep different sections in different cards.

Write in an entertaining manner, concise and to the point. 

only reply with the HTML code with no comments before or after.

Start with a general overview of what is happening in the field in no more than one or two paragraphs. Keep it highly specific to latest developments.`;

    // Load saved settings from localStorage
    apiKeyInput.value = localStorage.getItem("apiKey") || "";
    topicInput.value = localStorage.getItem("topic") || "";
    daysInput.value = localStorage.getItem("days") || "30";
    ncbiCheckbox.checked = JSON.parse(localStorage.getItem("ncbiCheckbox")) !== false;
    crossRefCheckbox.checked = JSON.parse(localStorage.getItem("crossRefCheckbox")) !== false;
    arxivCheckbox.checked = JSON.parse(localStorage.getItem("arxivCheckbox")) !== false;
    onlyReviewsCheckbox.checked = JSON.parse(localStorage.getItem("onlyReviewsCheckbox")) !== false; // Load review checkbox state
    gptEngineSelect.value = localStorage.getItem("gptEngine") || "gpt-4o-mini";
    customPromptTextarea.value = localStorage.getItem("customPrompt") || defaultPrompt;

    // Save settings to localStorage when inputs change
    apiKeyInput.addEventListener("input", function () {
        localStorage.setItem("apiKey", apiKeyInput.value);
    });

    topicInput.addEventListener("input", function () {
        localStorage.setItem("topic", topicInput.value);
    });

    daysInput.addEventListener("input", function () {
        localStorage.setItem("days", daysInput.value);
    });

    ncbiCheckbox.addEventListener("change", function () {
        localStorage.setItem("ncbiCheckbox", ncbiCheckbox.checked);
    });

    crossRefCheckbox.addEventListener("change", function () {
        localStorage.setItem("crossRefCheckbox", crossRefCheckbox.checked);
    });

    arxivCheckbox.addEventListener("change", function () {
        localStorage.setItem("arxivCheckbox", arxivCheckbox.checked);
    });

    onlyReviewsCheckbox.addEventListener("change", function () {
        localStorage.setItem("onlyReviewsCheckbox", onlyReviewsCheckbox.checked);
    });

    gptEngineSelect.addEventListener("change", function () {
        localStorage.setItem("gptEngine", gptEngineSelect.value);
    });

    customPromptTextarea.addEventListener("input", function () {
        localStorage.setItem("customPrompt", customPromptTextarea.value);
    });

    resetPromptButton.addEventListener("click", function () {
        customPromptTextarea.value = defaultPrompt;
        localStorage.setItem("customPrompt", defaultPrompt);
    });

    settingsButton.addEventListener("click", function () {
        if (settingsContent.classList.contains("show")) {
            settingsContent.classList.remove("show");
        } else {
            settingsContent.classList.add("show");
        }
        settingsButton.classList.toggle("active");
    });

    searchButton.addEventListener("click", function () {
        const apiKey = apiKeyInput.value;
        const topic = topicInput.value;
        const days = daysInput.value;
        const selectedEngine = gptEngineSelect.value;
        const customPrompt = customPromptTextarea.value;

        if (!apiKey || !topic || !days) {
            resultsDiv.innerHTML = "<p>Please fill out all fields.</p>";
            return;
        }

        resultsDiv.innerHTML = "";
        searchButton.textContent = "Searching...";
        searchButton.classList.add("loading");

        const selectedDatabases = {};
        if (ncbiCheckbox.checked) {
            selectedDatabases.NCBI = fetchNCBI(topic, days);
        }
        if (crossRefCheckbox.checked) {
            selectedDatabases.CrossRef = fetchCrossRef(topic);
        }
        if (arxivCheckbox.checked) {
            selectedDatabases.arXiv = fetchArxiv(topic);
        }

        const promises = Object.entries(selectedDatabases).map(([dbName, fetchPromise]) =>
            fetchPromise.then(papers => ({ dbName, papers }))
        );

        if (promises.length === 0) {
            resultsDiv.innerHTML = "<p>Please select at least one database.</p>";
            resetButton();
            return;
        }

        Promise.all(promises)
            .then(results => {
                let allPapers = [];
                results.forEach(({ dbName, papers }) => {
                    resultsDiv.innerHTML += `<p>${papers.length} results found in ${dbName}.</p>`;
                    allPapers = allPapers.concat(papers);
                });

                // Remove duplicate papers based on title
                const uniquePapers = removeDuplicates(allPapers);

                summarizePapers(uniquePapers, topic, apiKey, selectedEngine, customPrompt);
            })
            .catch(error => {
                console.error("Error fetching data:", error);
                resultsDiv.innerHTML += "<p>An error occurred while fetching data.</p>";
                resetButton();
            });
    });

    function updateButton(text) {
        searchButton.textContent = text;
    }

    function resetButton(done = false) {
        searchButton.classList.remove("loading");
        searchButton.textContent = done ? "Done" : "Search";
    }

    function removeDuplicates(results) {
        const seen = new Set();
        return results.filter(result => {
            const key = result.title;
            if (seen.has(key)) {
                return false;
            } else {
                seen.add(key);
                return true;
            }
        });
    }

    function summarizePapers(results, topic, apiKey, engine, promptTemplate) {
        resetButton();
        searchButton.textContent = "Summarizing...";
        searchButton.classList.add("loading");

        const prompt = promptTemplate.replace("{{topic}}", topic);

        const formattedResults = results.map(result => `
            <div class="article">
                <h3><a href="${result.link}" target="_blank">${result.title}</a></h3>
                <p><strong>Abstract:</strong> ${result.abstract}</p>
            </div>
        `).join("");

        fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: engine,
                messages: [
                    { "role": "system", "content": prompt },
                    { "role": "user", "content": formattedResults }
                ]
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.choices && data.choices.length > 0 && data.choices[0].message) {
                let summary = data.choices[0].message.content;

                // Trim "```html" and "```" from the beginning and the end
                if (summary.startsWith("```html")) {
                    summary = summary.substring(7); // Remove "```html\n"
                }
                if (summary.endsWith("```")) {
                    summary = summary.slice(0, -3); // Remove "```"
                }

                // Display the HTML content after processing
                resultsDiv.innerHTML += summary.trim();  
                setupWikiLinks();  // Make wiki links clickable to show/hide explanations
                resetButton(true); // Set button to done state
            } else {
                throw new Error("Invalid response from OpenAI API.");
            }
        })
        .catch(error => {
            console.error("Error with OpenAI API:", error);
            resultsDiv.innerHTML += "<p>An error occurred with OpenAI API.</p>";
            resetButton(); // Reset button if error
        });
    }

    function fetchNCBI(topic, days) {
        updateButton("Fetching from NCBI...");
        const onlyReviews = onlyReviewsCheckbox.checked ? "AND review[Publication Type]" : ""; // Include review filter if checkbox is checked
        const esearchUrl = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi";
        const esearchParams = new URLSearchParams({
            db: "pubmed",
            term: `${topic}[Title/Abstract] ${onlyReviews}`,
            datetype: "edat",
            reldate: days,
            retmax: "100",
            sort: "date",
            retmode: "json"
        });

        return fetch(`${esearchUrl}?${esearchParams}`)
            .then(response => response.json())
            .then(data => {
                const pmids = data.esearchresult.idlist.join(",");

                if (pmids.length === 0) {
                    return [];
                }

                const efetchUrl = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi";
                const efetchParams = new URLSearchParams({
                    db: "pubmed",
                    id: pmids,
                    retmode: "xml"
                });

                return fetch(`${efetchUrl}?${efetchParams}`)
                    .then(response => response.text())
                    .then(xmlString => {
                        const parser = new DOMParser();
                        const xmlDoc = parser.parseFromString(xmlString, "application/xml");
                        let papers = [];
                        let articles = xmlDoc.getElementsByTagName("PubmedArticle");

                        for (let i = 0; i < articles.length; i++) {
                            let title = articles[i].getElementsByTagName("ArticleTitle")[0].textContent;
                            let abstract = articles[i].getElementsByTagName("AbstractText")[0]?.textContent || "No abstract available";
                            let pmid = articles[i].getElementsByTagName("PMID")[0].textContent;
                            let link = `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`;

                            papers.push({
                                title: title,
                                abstract: abstract,
                                link: link
                            });
                        }
                        return papers;
                    });
            });
    }

    function fetchCrossRef(query) {
        updateButton("Fetching from CrossRef...");
        const crossRefUrl = `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=10`;

        return fetch(crossRefUrl)
            .then(response => response.json())
            .then(data => {
                return data.message.items.map(item => ({
                    title: item.title,
                    abstract: item.abstract || "No abstract available",
                    link: item.URL,
                    authors: (item.author || []).map(author => `${author.given} ${author.family}`).join(", ")
                }));
            })
            .catch(error => {
                console.error("Error fetching data from CrossRef:", error);
                return []; // Return an empty array if there's an error
            });
    }

    function fetchArxiv(query) {
        updateButton("Fetching from arXiv...");
        const arxivUrl = `http://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&start=0&max_results=10`;

        return fetch(arxivUrl)
            .then(response => response.text())
            .then(str => {
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(str, "application/xml");
                let entries = xmlDoc.getElementsByTagName("entry");
                let papers = [];

                for (let i = 0; i < entries.length; i++) {
                    let title = entries[i].getElementsByTagName("title")[0].textContent;
                    let abstract = entries[i].getElementsByTagName("summary")[0].textContent;
                    let link = entries[i].getElementsByTagName("id")[0].textContent;

                    papers.push({
                        title: title,
                        abstract: abstract,
                        link: link
                    });
                }

                return papers;
            })
            .catch(error => {
                console.error("Error fetching data from arXiv:", error);
                return []; // Return an empty array if there's an error
            });
    }

    function setupWikiLinks() {
        const wikiLinks = document.querySelectorAll(".wiki-link");
        wikiLinks.forEach(span => {
            span.style.cursor = "pointer";
            span.addEventListener("click", function () {
                const explanation = this.getAttribute("data-explanation");
                const existingExplanation = this.querySelector(".explanation");
                if (existingExplanation) {
                    // Toggle visibility if explanation is already present
                    existingExplanation.remove();
                } else {
                    const explanationNode = document.createElement("span");
                    explanationNode.className = "explanation";
                    explanationNode.style.marginLeft = "10px";
                    explanationNode.textContent = `[${explanation}]`;
                    this.appendChild(explanationNode);
                }
            });
        });
    }
});
