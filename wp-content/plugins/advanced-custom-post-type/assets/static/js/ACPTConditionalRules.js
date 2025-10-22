
/**
 * ACPT Back-end Live conditional rendering
 */
class ACPTConditionalRules
{
    constructor(page, belongsTo, elementId)
    {
        this.elements = document.body.querySelectorAll('[data-conditional-rules-id]');
        this.values = [];
        this.page = page;
        this.belongsTo = belongsTo;
        this.elementId = elementId;

        this.elements.forEach((element) => {

            const value = this.#getValue(element);
            const id = element.name;
            const formId = element.getAttribute("data-conditional-rules-id");
            const fieldIndex = element.getAttribute("data-conditional-rules-field-index");

            this.values.push({
                id: id,
                formId: formId,
                value: value,
                fieldIndex: fieldIndex
            });
        });

        const fromCache = this.#fromCache();

        if(fromCache !== null){
            this.#applyConditions(fromCache);
        } else {
            this.#applyIsVisible();
        }
    }

    run()
    {
        /**
         *
         * @param event
         */
        const changeValueHandler = (event) => {

            const element = event.target;
            const id = element.name;
            const formId = element.getAttribute("data-conditional-rules-id");
            const fieldIndex = element.getAttribute("data-conditional-rules-field-index");
            const value = this.#getValue(element);

            const elementIndex = this.values.findIndex((el) => {
                return el.id === id && el.formId === formId;
            });

            this.values[elementIndex] = {
                id: id,
                formId: formId,
                value: value,
                fieldIndex: fieldIndex
            };

            this.#applyIsVisible();
        };

        this.elements.forEach((element) => {
            element.addEventListener("change", this.#debounce(changeValueHandler, 1000));
            element.addEventListener("keyup", this.#debounce(changeValueHandler, 1000));
        });
    }

    /**
     *
     * @return {Promise<void>}
     */
    async #applyIsVisible()
    {
        let formData;
        const baseAjaxUrl = (typeof ajaxurl === 'string') ? ajaxurl : '/wp-admin/admin-ajax.php';

        formData = new FormData();
        formData.append('action', 'checkIsVisibleAction');
        formData.append('data', JSON.stringify({
            values: this.values,
            elementId: this.elementId,
            belongsTo: this.belongsTo,
        }));

        fetch(baseAjaxUrl, {
            method: 'POST',
            body: formData
        })
        .then((response) => {
            return response.json();
        })
        .then((data) => {
            this.#applyConditions(data);
            this.#saveInCache(data);

            return data;
        });
    }

    /**
     *
     * @param fn
     * @param delay
     * @param timeout
     * @return {function(...[*]=)}
     */
    #debounce = (fn, delay, timeout = 0) => (args) => {
        clearTimeout(timeout);
        // adds `as unknown as number` to ensure setTimeout returns a number
        // like window.setTimeout
        timeout = setTimeout(() => fn(args), delay);
    };

    /**
     *
     * @param element
     * @return {number}
     */
    #getValue = (element) => {

        let value;
        // is toggle element
        if(element.type === 'checkbox' && element.value === "1"){
            return element.checked ? 1 : 0;
        }

        return element.value;
    };

    /**
     * Apply conditions
     * @param data
     */
    #applyConditions = (data) => {
        for (const [key, value] of Object.entries(data)) {

            switch (typeof value) {
                case "boolean":
                    if(document.getElementById(key)){
                        if(value === false){
                            document.getElementById(key).classList.add("hidden");
                        } else {
                            document.getElementById(key).classList.remove("hidden");
                        }
                    }
                    break;

                case "object":
                    const elements = document.querySelectorAll(`[data-id="${key}"]`);

                    if(elements){
                        elements.forEach((element, index) => {
                            if(value[index] === false){
                                element.classList.add("hidden");
                            } else {
                                element.classList.remove("hidden");
                            }
                        });
                    }

                    break;
            }
        }
    };

    /**
     * ========================================
     * CACHE SECTION
     * ========================================
     */

    /**
     *
     * @return {string}
     */
    #cacheKey = () => {
        return `acpt_conditional_rules_cache_${this.page}`;
    };

    /**
     * save elements in the browser's cache
     * @param data
     */
    #saveInCache = (data) => {
        localStorage.setItem(this.#cacheKey(), JSON.stringify(data));
    };

    /**
     * retrieve elements from the browser's cache
     * @return {null|any}
     */
    #fromCache = () => {
        const retrievedObject = localStorage.getItem(this.#cacheKey());

        if(retrievedObject){
            return JSON.parse(retrievedObject)
        }

        return null;
    };
}

