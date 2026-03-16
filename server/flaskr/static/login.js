async function handleLogin(event) {
	event.preventDefault();

	const uName = document.querySelector('#username').value;
	const passW = document.querySelector('#user_password').value;

	if (!(uName.length > 5)) {
        alert("Username too short, username must be more than 5 characters");
        return
    }

    if (!(passW.length > 6)) {
    	alert("Password too short, password must be more than 6 characters");
    	return
	}

	const dataToSend = {
		username: uName,
		password: passW
	};

	try {
		const response = await fetch('/login', {
			method: 'POST', // POST keeps passwords hidden
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(dataToSend)
		});

		const result = await response.json();

		console.log("Server response:", result);

		if (result.status === "successful") {
			alert("Login successful.. redirecting to profile page");
			window.location.href = `/user/${uName}`; 
		} else if (result.status === "unsuccessful") {
			alert("Login unsuccessful, account not found or wrong credentials");
		}
	}catch (error) {
		console.log("Network error:", error);
	}

}



const loginForm = document.querySelector('#loginForm');

if (loginForm) {

	loginForm.addEventListener('submit', handleLogin)
}