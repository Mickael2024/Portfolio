const css = document.getElementById("stylesheet");
document.getElementById("mode").addEventListener("click", function() {
    if (css.getAttribute("href") === "./css/designe.css") {
        css.setAttribute("href", "./css/designeNuit.css");
        document.querySelector(".mode-icon").src = "./image/mode-jour.png";
    } else {
        css.setAttribute("href", "./css/designe.css");
        document.querySelector(".mode-icon").src = "./image/mode-nuit.png";
    }
}) 

// js/stars.js
// js/stars.js

document.addEventListener('DOMContentLoaded', () => {
    // Corrected querySelectorAll syntax to select multiple, independent elements
    document.querySelectorAll('.header, .side-left, .side-center, .side-right, .my-services').forEach(element => {
        element.classList.add('active');
    });
    document.querySelectorAll('.service-case').forEach(element => {
        element.classList.add('active');
      
    });
});

document.querySelectorAll('.service-case').forEach(element => {
   

   })
  

