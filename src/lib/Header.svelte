<script>
    import tlo from "$lib/assets/dziara_tlo.jpg";
</script>

<header>
    <img src={tlo} alt="Dziara Tło" />
    <nav>
        <ul>
            <li><a href="/">Home</a></li>
            <li><a href="/about">About</a></li>
            <li><a href="/gallery">Gallery</a></li>
            <li><a href="/contact">Contact</a></li>
        </ul>
    </nav>
</header>


<style>
    header {
        background-color: black;
        color: #fff;
    }

    img {
        width: 100%;
        height: 400px;
        object-fit: none;
        mask-image: linear-gradient(#000, transparent);
    }

    nav ul {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        justify-content: space-between;
    }

    nav li {
        margin-right: 1rem;
    }

    nav a {
        color: #fff;
        text-decoration: none;
    }

    nav a:hover {
        text-decoration: underline;
    }
</style>
