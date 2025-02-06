window.initializeFileDropZone = (dropZoneElement) => {
    console.log('Initializing drop zone', dropZoneElement);
    
    // Get the input element
    const inputFile = dropZoneElement.querySelector('input[type="file"]');
    console.log('Found input element', inputFile);

    // Track drag counter to handle nested elements
    let dragCounter = 0;

    // Add dragenter handler
    dropZoneElement.addEventListener('dragenter', e => {
        e.preventDefault();
        dragCounter++;
        dropZoneElement.dispatchEvent(new CustomEvent('blazordragenter'));
        console.log('Drag enter, counter:', dragCounter);
    });

    // Add dragleave handler
    dropZoneElement.addEventListener('dragleave', e => {
        e.preventDefault();
        dragCounter--;
        if (dragCounter === 0) {
            dropZoneElement.dispatchEvent(new CustomEvent('blazordragleave'));
        }
        console.log('Drag leave, counter:', dragCounter);
    });

    // Add dragover handler
    dropZoneElement.addEventListener('dragover', e => {
        e.preventDefault();
        e.stopPropagation();
    });

    // Add drop handler
    dropZoneElement.addEventListener('drop', async e => {
        console.log('Drop event triggered');
        e.preventDefault();
        e.stopPropagation();
        dragCounter = 0;
        dropZoneElement.dispatchEvent(new CustomEvent('blazordragleave'));

        if (!e.dataTransfer) {
            console.log('No dataTransfer found');
            return;
        }

        // Get the files
        const files = e.dataTransfer.files;
        console.log('Dropped files:', files);

        if (files && files.length) {
            // Get the first file
            const file = files[0];
            console.log('Processing file:', file.name);
            
            // Create a DataTransfer
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);

            // Set the value of the input
            inputFile.files = dataTransfer.files;
            console.log('Set input files');

            // Dispatch an event - this tells Blazor to fire the OnChange handler
            const event = new Event('change', { bubbles: true });
            inputFile.dispatchEvent(event);
            console.log('Dispatched change event');
        }

        // Notify C# that the drop is complete
        await dropZoneElement.dispatchEvent(new CustomEvent('drop'));
        console.log('Drop complete');
    });
};

window.openFileInput = (inputId) => {
    const input = document.getElementById(inputId);
    if (input) {
        input.click();
    }
}; 