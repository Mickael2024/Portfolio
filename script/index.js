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
    document.querySelectorAll('.service-case, .parcours-case').forEach(element => {
        element.classList.add('active');
    });
});

document.querySelectorAll('.parcours-case').forEach(element => {

element.addEventListener('click', () => {
         
    
    const popupOverlay = document.getElementById('popupOverlay');
    const popupContent = document.getElementById('popupContent');
    
    popupContent.innerHTML = `<span class="close-btn" id="closePopupBtn">&times;</span> ${element.innerHTML}`; // Utilise innerHTML pour récupérer le contenu de l'élément cliqué
    const closePopupBtn = document.getElementById('closePopupBtn');
    popupOverlay.style.display = 'flex'; // Affiche le pop-up
    popupOverlay.classList.remove('hidden'); // Retire la classe 'hidden' s'il y en a une
    document.body.style.overflow = 'hidden'; 


    closePopupBtn.addEventListener('click', closePopup);
    popupOverlay.addEventListener('click', (event) => {
        if (event.target === popupOverlay) {
            closePopup();
        }
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && popupOverlay.style.display === 'flex') {
            closePopup();
        }
    });
});
})

function closePopup() {
    const popupOverlay = document.getElementById('popupOverlay');
    const popupContent = document.getElementById('popupContent');
    popupOverlay.classList.add('hidden'); // Ajoute la classe 'hidden' pour l'animation de sortie
    // Attendre la fin de l'animation pour masquer complètement
    popupOverlay.addEventListener('animationend', function handler() {
        popupOverlay.style.display = 'none';
        popupOverlay.classList.remove('hidden'); // Nettoyer la classe après l'animation
        popupOverlay.removeEventListener('animationend', handler); // Supprimer l'écouteur pour éviter des exécutions multiples
    });
    document.body.style.overflow = 'auto'; // Réactive le défilement du corps de la page
}

window.addEventListener('scroll', () => {
    const myParcours = document.querySelector('.my-parcours');
    const cv_motivation = document.querySelector('.cv-motivation-section');
    const rect = myParcours.getBoundingClientRect();
    const rect_cv_motivation = cv_motivation.getBoundingClientRect();
    const top = rect.top + window.scrollY; // position absolue du haut de l'élément
    const top_rect_cv_motivation = rect_cv_motivation.top + window.scrollY; // position absolue du haut de l'élément
    const height = myParcours.offsetHeight;
    const height_cv_motivation = cv_motivation.offsetHeight;
    const scrollY = window.scrollY;
    // Par exemple, active si le scroll est dans la zone de l'élément
    if (scrollY + window.innerHeight > top && scrollY < top + height) {
        myParcours.classList.add('active');
    } else {
        myParcours.classList.remove('active');
    }
    if (scrollY + window.innerHeight > top_rect_cv_motivation && scrollY < top_rect_cv_motivation + height_cv_motivation) {
        cv_motivation.classList.add('active');
    } else {
        cv_motivation.classList.remove('active');
    }
});




  

