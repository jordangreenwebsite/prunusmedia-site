
window.onload = function () {

    // Icon picker
    if(typeof IconPicker === 'function'){

        const iconPickerInputs = document.getElementsByClassName("acpt-iconpicker");

        if(iconPickerInputs.length > 0) {
            for (let i = 0; i < iconPickerInputs.length; i++) {

                const target = iconPickerInputs.item(i).dataset.target;
                const iconPickerInput = new IconPicker(iconPickerInputs.item(i), {
                    theme: 'bootstrap-5',
                    iconSource: [
                        'Iconoir',
                        'FontAwesome Solid 6',
                    ],
                    closeOnSelect: true
                });

                const iconElementInput = document.getElementById(target+"_target");
                const iconElementValue = document.getElementById(target+"_svg");

                iconPickerInput.on('select', (icon) => {

                    if (iconElementInput.innerHTML !== '') {
                        iconElementInput.innerHTML = '';
                    }

                    iconElementInput.className = `acpt-selected-icon ${icon.name}`;
                    iconElementInput.innerHTML = icon.svg;
                    iconElementValue.value = icon.svg;
                });
            }
        }
    }

    // CodeMirror
    if(typeof CodeMirror === 'function'){
        const codeMirrors = document.getElementsByClassName("acpt-codemirror");

        if(codeMirrors.length > 0){
            for (let i = 0; i < codeMirrors.length; i++) {
                CodeMirror.fromTextArea(codeMirrors.item(i), {
                    indentUnit: 2,
                    tabSize: 2,
                    mode: 'htmlmixed',
                    lineNumbers: true
                })
            }
        }
    }
};