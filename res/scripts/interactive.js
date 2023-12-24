window.onload = function() {	
    createEditor();

}


function createEditor()
{
    const addressColumn = document.getElementById("address-column");
    const inputColumn = document.getElementById("input");
    inputColumn.innerHTML = "";

    for(let i = 0; i < 32; i++)
    {
        const addr = document.createElement("div");
        addr.id = `address-${i}`;
        addr.textContent = i.toString().padStart(8, '0');

        const inputSpan = document.createElement("input");
        inputSpan.type = "text";
        inputSpan.id = `input-${i}`;

        addressColumn.appendChild(addr);
        inputColumn.appendChild(inputSpan);
    }
}