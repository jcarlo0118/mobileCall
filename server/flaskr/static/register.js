
// 'async' tells the browser: "This function will talk to a network, so be ready to pause."
async function handleRegistration(event) {
    
    // Forms naturally want to refresh the page when submitted. This stops that entirely.
    event.preventDefault(); 

    // Find the input boxes by their HTML IDs and grab the text (.value) the user typed.
    const uName = document.querySelector('#username').value;
    const pass = document.querySelector('#user_password').value;
    const confirmPass = document.querySelector('#confirm_user_password').value;

    
if (!(uName.length > 5)) {
        alert("Username too short, username must be more than 5 characters");
        return
    }
    if (!(pass.length > 6 && confirmPass.length > 6)) {
        alert("Password too short, password must be more than 6 characters");
        return

    }else if ( pass !== confirmPass) {
        // Pop up a warning box in the browser.
        alert("Passwords do not match!");
        // 'return' immediately kills the function so it doesn't run the code below.
        return; 
    } 

    // Package the raw data into a neat JavaScript Object (like a dictionary in Python).
    const dataToSend = {
        username: uName,
        password: pass
    };

    // 'try' creates a safe zone. If the server is turned off, the page won't crash.
    try {
        // 'await fetch' means: "Send the data to this URL, and pause the code until we get a reply."
        const response = await fetch('/register', {
            method: 'POST', // We are sending data, not asking for a web page.
            headers: { 
                // Tells the Python server: "The text I am sending you is formatted as JSON."

                'Content-Type': 'application/json' 
            },
            // 'JSON.stringify' translates the JS object into flat text for its trip across the internet.
            body: JSON.stringify(dataToSend) 
        });

        // The server sent a reply! 'await' pauses again while we unpack the JSON text back into a JS object.
        const result = await response.json();
        
        // Print the server's reply to the browser's developer console for debugging.
        console.log("Server response:", result);

        // If he registration worked, send the user back to the login page.
        if (result.status === "successful") {
        	alert(result.message);
            window.location.href = "/login";

        //if it didnt work due to an IntegrityError 
        } else if(result.status === "unsuccessful") {
            alert(result.message);
        }

    //intercepts network failures (like if the user's WiFi drops).
    } catch (error) {
        console.error("Network error:", error);
    }
}


// Look at the current HTML page and try to find the registration form.
const registerForm = document.querySelector('#registerForm');

// If the form exists on this specific page, attach the event listener.
if (registerForm) {
    // When the user clicks the "Submit" button, run the 'handleRegistration' function.
    registerForm.addEventListener('submit', handleRegistration);
}

