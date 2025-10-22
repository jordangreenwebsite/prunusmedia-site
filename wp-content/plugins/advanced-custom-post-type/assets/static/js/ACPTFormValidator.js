
/**
 * ACPT Form Validator
 */
class ACPTFormValidator
{
    /**
     *
     * @param action
     */
    constructor(action) {

        this.errors = [];
        this.elements = document.body.querySelectorAll('[data-acpt-validate]');
        this.action = action;

        // set button
        switch (this.action){
            case "save-option-page":
                this.button = document.getElementById('save-option-page');
                break;

            case "add-tax":
            case "save-user":
                this.button = document.getElementById('submit');
                break;

            case "edit-tax":
                this.button = document.querySelector('.button-primary');
                break;

            case "save-cpt":
                this.button = document.querySelector('.editor-post-publish-button');
                break;
        }

        if(!this.button){
            this.button = document.body.querySelector('[data-acpt-submit]');
        }
    }

    run()
    {
        this.elements.forEach((element) => {

            this.#changeValueHandler(element);

            element.addEventListener("change", (e) => {
                this.#changeValueHandler(e.target);
            });

            element.addEventListener("keyup", (e) => {
                this.#changeValueHandler(e.target);
            });
        });

        this.#handleOnButtonClick();
    }

    /**
     *
     * @return {boolean}
     */
    #formIsValid()
    {
        return this.errors.filter((err) => err.errors.length > 0).length === 0;
    }

    #handleOnButtonClick()
    {
        if(this.button){
            this.button.addEventListener("click", (e) => {

                this.elements.forEach((element) => {
                    this.#changeValueHandler(element);
                });

                if(!this.#formIsValid()){
                    e.stopPropagation();
                    e.preventDefault();
                }
            });
        }
    }

    #changeValueHandler(element)
    {
        const value = element.value;
        const id = element.id;

        /**
         *
         * @return {[]}
         */
        const getErrors = () => {

            const errors = [];

            // all possible rules
            const isRequired = element.required;
            const isRequiredMessage = element.getAttribute("data-acpt-validate-required");
            const isBlank = element.getAttribute("data-acpt-validate-blank");
            const isBlankMessage = element.getAttribute("data-acpt-validate-blank-message");
            const isNotBlank = element.getAttribute("data-acpt-validate-not-blank");
            const isNotBlankMessage = element.getAttribute("data-acpt-validate-not-blank-message");
            const isEquals = element.getAttribute("data-acpt-validate-equals");
            const isEqualsMessage = element.getAttribute("data-acpt-validate-equals-message");
            const isNotEquals = element.getAttribute("data-acpt-validate-not-equals");
            const isNotEqualsMessage = element.getAttribute("data-acpt-validate-not-equals-message");
            const gt = element.getAttribute("data-acpt-validate-gt");
            const gtMessage = element.getAttribute("data-acpt-validate-gt-message");
            const gte = element.getAttribute("data-acpt-validate-gte");
            const gteMessage = element.getAttribute("data-acpt-validate-gte-message");
            const lt = element.getAttribute("data-acpt-validate-lt");
            const ltMessage = element.getAttribute("data-acpt-validate-lt-message");
            const lte = element.getAttribute("data-acpt-validate-lte");
            const lteMessage = element.getAttribute("data-acpt-validate-lte-message");
            const max = element.getAttribute("data-acpt-validate-max");
            const maxMessage = element.getAttribute("data-acpt-validate-max-message");
            const min = element.getAttribute("data-acpt-validate-min");
            const minMessage = element.getAttribute("data-acpt-validate-min-message");
            const maxLength = element.getAttribute("data-acpt-validate-maxlength");
            const maxLengthMessage = element.getAttribute("data-acpt-validate-maxlength-message");
            const minLength = element.getAttribute("data-acpt-validate-minlength");
            const minLengthMessage = element.getAttribute("data-acpt-validate-minlength-message");
            const regex = element.getAttribute("data-acpt-validate-regex");
            const regexMessage = element.getAttribute("data-acpt-validate-regex-message");
            const minAttr = element.getAttribute('min');
            const maxAttr = element.getAttribute('max');
            const minLengthAttr = element.getAttribute('minlength');
            const maxLengthAttr = element.getAttribute('maxlength');

            if(isRequired){
                if(value === ''){
                    errors.push(isRequiredMessage);
                }
            }

            if(isBlank){
                if(value !== ''){
                    errors.push(isBlankMessage);
                }
            }

            if(isNotBlank){
                if(value === ''){
                    errors.push(isNotBlankMessage);
                }
            }

            if(isEquals){
                if(value !== isEquals){
                    errors.push(isEqualsMessage);
                }
            }

            if(isNotEquals){
                if(value === isNotEquals){
                    errors.push(isNotEqualsMessage);
                }
            }

            if(lt){
                if(parseInt(value) > parseInt(lt)){
                    errors.push(ltMessage);
                }
            }

            if(lte){
                if(parseInt(value) >= parseInt(lte)){
                    errors.push(lteMessage);
                }
            }

            if(gt){
                if(parseInt(value) < parseInt(gt)){
                    errors.push(gtMessage);
                }
            }

            if(gte){
                if(parseInt(value) <= parseInt(gte)){
                    errors.push(gteMessage);
                }
            }

            if(max){
                if(parseInt(value) > parseInt(max)){
                    errors.push(maxMessage);
                }
            }

            if(min){
                if(parseInt(value) < parseInt(min)){
                    errors.push(minMessage);
                }
            }

            if(maxAttr){
                if(parseInt(value) >= parseInt(maxAttr)){
                    errors.push(`Max length ${maxAttr}`);
                }
            }

            if(minAttr){
                if(parseInt(value) < parseInt(minAttr)){
                    errors.push(`Min length ${minAttr}`);
                }
            }

            if(maxLength){
                if(value.length > parseInt(maxLength)){
                    errors.push(maxLengthMessage);
                }
            }

            if(minLength){
                if(value.length < parseInt(minLength)){
                    errors.push(minLengthMessage);
                }
            }

            if(maxLengthAttr){
                if(value.length >= parseInt(maxLengthAttr)){
                    errors.push(`Max length ${maxLengthAttr}`);
                }
            }

            if(minLengthAttr){
                if(value.length < parseInt(minLengthAttr)){
                    errors.push(`Min length ${minLengthAttr}`);
                }
            }

            if(regex){
                const re = new RegExp(regex);
                if (!re.test(String(value))) {
                    errors.push(regexMessage);
                }
            }

            function onlyUnique(value, index, array) {
                return array.indexOf(value) === index;
            }

            return errors.filter(onlyUnique);
        };

        const errors = getErrors();
        const errorIndex = this.errors.findIndex(err => err.id === id);

        if(errorIndex === -1){
            this.errors.push({
                id: id,
                errors: errors
            });
        } else {
            this.errors[errorIndex] = {
                id: id,
                errors: errors
            };
        }

        this.#displayErrors();
        this.#disableButton();
    }

    #displayErrors()
    {
        this.errors.map((error) => {

            const id = error.id;
            const errors = error.errors;
            const errorListId = `acpt-error-list-${id}`;
            const element = document.getElementById(id);

            if(!element){
                return;
            }

            let errorsList;
            let errorsListArray = [];

            if(!document.getElementById(errorListId)){
                errorsList = document.createElement("ul");
                errorsList.id = errorListId;
                errorsList.classList.add("acpt-error-list");
            } else {
                errorsList = document.getElementById(errorListId);
                document.getElementById(errorListId).innerHTML = '';
            }

            if(errors.length > 0){

                element.classList.add("has-errors");

                errors.map((err) => {
                    const check = errorsListArray.findIndex(err => err.id === id);

                    if(check === -1){
                        const errorLi = document.createElement("li");
                        errorLi.innerHTML = err;
                        errorsList.appendChild(errorLi);
                        errorsListArray.push(error);
                    }
                });

            } else {
                element.classList.remove("has-errors");
                errorsList = null;

                if(document.getElementById(errorListId)){
                    document.getElementById(errorListId).innerHTML = '';
                }
            }
        });
    }

    #disableButton()
    {
        if(this.button){
            if(!this.#formIsValid()){
                this.button.disabled = true;
            } else {
                this.button.disabled = false;
            }
        }
    }
}
