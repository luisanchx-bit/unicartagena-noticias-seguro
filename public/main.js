const noticias = [
    {
        id: 1,
        titulo: "📢 Apertura de Convocatoria Docente 2025-1",
        categoria: "convocatorias",
        fecha: "15 de Enero, 2025",
        descripcion: "La Universidad de Cartagena abre inscripciones para nuevos docentes investigadores. Plazo hasta el 28 de febrero.",
        url: "https://www.unicartagena.edu.co/convocatorias/docentes2025",
        imagen: "https://picsum.photos/id/100/400/200"
    },
    {
        id: 2,
        titulo: "🎓 Congreso Internacional de Ingeniería",
        categoria: "eventos",
        fecha: "20-22 de Febrero, 2025",
        descripcion: "Participa en el Congreso Internacional de Ingeniería con ponentes de todo el mundo. Inscripciones abiertas.",
        url: "https://www.unicartagena.edu.co/eventos/congreso-ingenieria",
        imagen: "https://picsum.photos/id/26/400/200"
    },
    {
        id: 3,
        titulo: "📚 Nuevos Programas de Posgrado",
        categoria: "generales",
        fecha: "10 de Enero, 2025",
        descripcion: "La universidad lanza 5 nuevas especializaciones en áreas tecnológicas y de salud.",
        url: "https://www.unicartagena.edu.co/posgrados/nuevos-programas",
        imagen: "https://picsum.photos/id/20/400/200"
    },
    {
        id: 4,
        titulo: "💼 Feria de Empleo Unicartagena",
        categoria: "eventos",
        fecha: "5 de Marzo, 2025",
        descripcion: "Empresas nacionales e internacionales buscan talento Unicartagena. ¡No te lo pierdas!",
        url: "https://www.unicartagena.edu.co/eventos/feria-empleo",
        imagen: "https://picsum.photos/id/1/400/200"
    },
    {
        id: 5,
        titulo: "🏅 Becas de Excelencia Académica",
        categoria: "convocatorias",
        fecha: "1 de Febrero, 2025",
        descripcion: "Becas para estudiantes con alto rendimiento. Cobertura del 50% al 100% de matrícula.",
        url: "https://www.unicartagena.edu.co/becas/excelencia2025",
        imagen: "https://picsum.photos/id/28/400/200"
    },
    {
        id: 6,
        titulo: "🌍 Semana de la Internacionalización",
        categoria: "eventos",
        fecha: "10-14 de Marzo, 2025",
        descripcion: "Conferencias sobre movilidad estudiantil y convenios internacionales.",
        url: "https://www.unicartagena.edu.co/eventos/internacionalizacion",
        imagen: "https://picsum.photos/id/29/400/200"
    }
];

function mostrarNoticias(categoria = 'todas') {
    const container = document.getElementById('noticias-container');
    if (!container) return;
    
    let noticiasFiltradas = noticias;
    if (categoria !== 'todas') {
        noticiasFiltradas = noticias.filter(n => n.categoria === categoria);
    }
    
    container.innerHTML = '';
    
    if (noticiasFiltradas.length === 0) {
        container.innerHTML = '<p style="text-align:center; grid-column:1/-1; color:white;">📭 No hay noticias en esta categoría</p>';
        return;
    }
    
    noticiasFiltradas.forEach(noticia => {
        const tarjeta = document.createElement('div');
        tarjeta.className = 'tarjeta-noticia';
        
        let categoriaClass = '', categoriaTexto = '';
        switch(noticia.categoria) {
            case 'convocatorias':
                categoriaClass = 'convocatorias';
                categoriaTexto = '📢 Convocatoria';
                break;
            case 'eventos':
                categoriaClass = 'eventos';
                categoriaTexto = '🎉 Evento';
                break;
            case 'generales':
                categoriaClass = 'generales';
                categoriaTexto = 'ℹ️ General';
                break;
        }
        
        tarjeta.innerHTML = `
            <img src="${noticia.imagen}" alt="Imagen noticia" class="imagen-noticia" loading="lazy">
            <div class="categoria ${categoriaClass}">${categoriaTexto}</div>
            <h3>${noticia.titulo}</h3>
            <div class="fecha">📅 ${noticia.fecha}</div>
            <div class="descripcion">${noticia.descripcion}</div>
            <div class="link-externo">
                <a href="${noticia.url}" target="_blank" rel="noopener noreferrer">
                    🔗 Más información en la página oficial →
                </a>
            </div>
        `;
        container.appendChild(tarjeta);
    });
}

function inicializarFiltros() {
    const botones = document.querySelectorAll('.filtro-btn');
    botones.forEach(boton => {
        boton.addEventListener('click', () => {
            botones.forEach(b => b.classList.remove('activo'));
            boton.classList.add('activo');
            mostrarNoticias(boton.getAttribute('data-categoria'));
        });
    });
}

// Verificar si el usuario está logueado para mostrar "Cerrar sesión"
async function verificarSesion() {
    try {
        const response = await fetch('/api/verificar-sesion');
        const data = await response.json();
        const botonContainer = document.getElementById('boton-sesion-container');
        if (botonContainer) {
            if (data.logueado) {
                botonContainer.innerHTML = `<a href="/logout" class="btn-sesion btn-logout">🚪 Cerrar sesión</a>`;
            } else {
                botonContainer.innerHTML = `<a href="/login.html" class="btn-sesion">🔐 Área Administrativa</a>`;
            }
        }
    } catch (error) {
        console.log('Error al verificar sesión:', error);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    mostrarNoticias('todas');
    inicializarFiltros();
    verificarSesion();
});