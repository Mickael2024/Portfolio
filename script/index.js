const css = document.getElementById("stylesheet")


document.getElementById("mode").addEventListener("click", function() {
    if (css.getAttribute("href") === "./css/designe.css") {
        css.setAttribute("href", "./css/designeNuit.css");
        document.querySelector(".mode-icon").src = "./image/mode-jour.png";
    } else {
        css.setAttribute("href", "./css/designe.css");
        document.querySelector(".mode-icon").src = "./image/mode-nuit.png";
    }
}) 