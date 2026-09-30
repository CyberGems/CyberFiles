using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Windows.ApplicationModel.DataTransfer;

namespace CyberFiles.WinUIPrototype;

public static class TextInputContextMenu
{
    public static void Attach(TextBox textBox, Func<bool> isSpanish)
    {
        var undo = CreateItem("Undo", "\uE7A7", () =>
        {
            if (textBox.CanUndo)
                textBox.Undo();
        });
        var redo = CreateItem("Redo", "\uE7A6", () =>
        {
            if (textBox.CanRedo)
                textBox.Redo();
        });
        var copy = CreateItem("Copy", "\uE8C8", () =>
        {
            if (textBox.SelectionLength == 0)
                return;

            var package = new DataPackage();
            package.SetText(textBox.SelectedText);
            Clipboard.SetContent(package);
        });
        var paste = CreateItem("Paste", "\uE77F", () => { });
        paste.Click += async (_, _) =>
        {
            var content = Clipboard.GetContent();
            if (!content.Contains(StandardDataFormats.Text))
                return;

            try
            {
                textBox.SelectedText = await content.GetTextAsync();
            }
            catch
            {
                // Clipboard contents can change or become unavailable while the menu is open.
            }
        };
        var selectAll = CreateItem("Select all", "\uE8B3", textBox.SelectAll);
        var delete = CreateItem("Delete", "\uE74D", () =>
        {
            if (textBox.SelectionLength > 0)
            {
                textBox.SelectedText = string.Empty;
                return;
            }

            if (textBox.SelectionStart < textBox.Text.Length)
                textBox.Text = textBox.Text.Remove(textBox.SelectionStart, 1);
        });

        var flyout = new MenuFlyout();
        flyout.Items.Add(undo);
        flyout.Items.Add(redo);
        flyout.Items.Add(new MenuFlyoutSeparator());
        flyout.Items.Add(copy);
        flyout.Items.Add(paste);
        flyout.Items.Add(selectAll);
        flyout.Items.Add(delete);
        flyout.Opening += (_, _) =>
        {
            undo.Text = isSpanish() ? "Deshacer" : "Undo";
            redo.Text = isSpanish() ? "Rehacer" : "Redo";
            copy.Text = isSpanish() ? "Copiar" : "Copy";
            paste.Text = isSpanish() ? "Pegar" : "Paste";
            selectAll.Text = isSpanish() ? "Seleccionar todo" : "Select all";
            delete.Text = isSpanish() ? "Eliminar" : "Delete";
            undo.IsEnabled = textBox.CanUndo;
            redo.IsEnabled = textBox.CanRedo;
            copy.IsEnabled = textBox.SelectionLength > 0;
            try
            {
                paste.IsEnabled = Clipboard.GetContent().Contains(StandardDataFormats.Text);
            }
            catch
            {
                paste.IsEnabled = false;
            }
            delete.IsEnabled = textBox.SelectionLength > 0 || textBox.SelectionStart < textBox.Text.Length;
        };

        textBox.ContextFlyout = flyout;
    }

    private static MenuFlyoutItem CreateItem(string english, string glyph, Action action)
    {
        var item = new MenuFlyoutItem
        {
            Text = english,
            Icon = new FontIcon { Glyph = glyph, FontFamily = new FontFamily("Segoe MDL2 Assets") },
        };
        item.Click += (_, _) => action();
        return item;
    }
}
